import { lookup } from 'node:dns/promises';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { isIP } from 'node:net';

type SafeOutboundOptions = {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
  maxBytes?: number;
  requireHttps?: boolean;
  allowPrivateAddress?: boolean;
};

export type SafeOutboundResponse = {
  status: number;
  headers: Headers;
  body: Buffer;
};

const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_MAX_BYTES = 2 * 1024 * 1024;

export class UnsafeOutboundUrlError extends Error {}

function isBlockedIpv4(value: string) {
  const parts = value.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [a, b] = parts;
  return a === 0 || a === 10 || a === 127 || a >= 224
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && (b === 0 || b === 168))
    || (a === 198 && (b === 18 || b === 19 || b === 51))
    || (a === 203 && b === 0);
}

function mappedIpv4(value: string) {
  const normalized = value.toLowerCase();
  if (!normalized.startsWith('::ffff:')) return null;
  const tail = normalized.slice('::ffff:'.length);
  if (/^\d+\.\d+\.\d+\.\d+$/.test(tail)) return tail;
  const blocks = tail.split(':');
  if (blocks.length !== 2 || !blocks.every((block) => /^[0-9a-f]{1,4}$/.test(block))) return null;
  const first = Number.parseInt(blocks[0], 16);
  const second = Number.parseInt(blocks[1], 16);
  return [first >> 8, first & 255, second >> 8, second & 255].join('.');
}

function isBlockedIpv6(value: string) {
  const normalized = value.toLowerCase();
  const mapped = mappedIpv4(normalized);
  if (mapped) return isBlockedIpv4(mapped);
  // Treat transition and deprecated local-use ranges as non-public too. A
  // global-unicast-looking wrapper can otherwise carry an internal IPv4
  // destination (for example 6to4) past the outbound boundary.
  return normalized === '::' || normalized === '::1' || normalized.startsWith('::')
    || normalized.startsWith('fc') || normalized.startsWith('fd')
    // fe80::/10 is link-local and fec0::/10 is the deprecated site-local
    // range. Neither is globally routable.
    || /^fe[89a-f]/.test(normalized)
    || normalized.startsWith('ff')
    || normalized.startsWith('2001:db8')
    || normalized.startsWith('2002:')
    || /^2001:0(?::|$)/.test(normalized)
    || normalized.startsWith('64:ff9b:');
}

function isBlockedAddress(address: string) {
  const type = isIP(address);
  return type === 4 ? isBlockedIpv4(address) : type === 6 ? isBlockedIpv6(address) : true;
}

export async function assertPublicOutboundUrl(input: string, options: { requireHttps?: boolean; allowPrivateAddress?: boolean } = {}) {
  let target: URL;
  try {
    target = new URL(input);
  } catch {
    throw new UnsafeOutboundUrlError('外部服务地址格式无效。');
  }

  if (!['http:', 'https:'].includes(target.protocol)) {
    throw new UnsafeOutboundUrlError('外部服务地址仅支持 http 或 https。');
  }
  if (options.requireHttps && target.protocol !== 'https:') {
    throw new UnsafeOutboundUrlError('生产环境的外部服务地址必须使用 HTTPS。');
  }
  if (target.username || target.password) {
    throw new UnsafeOutboundUrlError('外部服务地址不能包含用户名或密码。');
  }

  const hostname = target.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (hostname === 'localhost' || hostname.endsWith('.localhost')) {
    throw new UnsafeOutboundUrlError('不允许访问 localhost 或内网服务。');
  }

  const type = isIP(hostname);
  const addresses = type
    ? [{ address: hostname, family: type }]
    : await lookup(hostname, { all: true, verbatim: true });
  if (addresses.length === 0 || (!options.allowPrivateAddress && addresses.some((entry) => isBlockedAddress(entry.address)))) {
    throw new UnsafeOutboundUrlError('外部服务地址解析到了受限制的网络地址。');
  }
  return { target, addresses };
}

/**
 * Requests a hostname through a public IP selected during validation. Pinning the
 * socket address avoids a second DNS lookup turning an allowed hostname into a
 * private target after a DNS-rebinding response.
 */
export async function safeOutboundRequest(input: string | URL, options: SafeOutboundOptions = {}): Promise<SafeOutboundResponse> {
  const { target, addresses } = await assertPublicOutboundUrl(String(input), {
    requireHttps: options.requireHttps,
    allowPrivateAddress: options.allowPrivateAddress,
  });
  const address = addresses.find((entry) => entry.family === 4) || addresses[0];
  const transport = target.protocol === 'https:' ? httpsRequest : httpRequest;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;

  return new Promise<SafeOutboundResponse>((resolve, reject) => {
    const deadline = setTimeout(() => request.destroy(new Error('外部请求超时。')), timeoutMs);
    const request = transport({
      protocol: target.protocol,
      hostname: address.address,
      family: address.family,
      port: target.port || undefined,
      method: options.method || 'GET',
      path: `${target.pathname}${target.search}`,
      headers: {
        Host: target.host,
        ...options.headers,
      },
      ...(target.protocol === 'https:' ? { servername: target.hostname } : {}),
    }, (response) => {
      const headers = new Headers();
      for (const [key, value] of Object.entries(response.headers)) {
        if (Array.isArray(value)) headers.set(key, value.join(', '));
        else if (value !== undefined) headers.set(key, String(value));
      }

      const declaredLength = Number.parseInt(headers.get('content-length') || '0', 10);
      if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
        response.destroy();
        reject(new Error('外部响应体过大。'));
        return;
      }

      const chunks: Buffer[] = [];
      let received = 0;
      response.on('data', (chunk: Buffer) => {
        received += chunk.length;
        if (received > maxBytes) {
          response.destroy(new Error('外部响应体过大。'));
          return;
        }
        chunks.push(chunk);
      });
      response.on('error', (error) => {
        clearTimeout(deadline);
        reject(error);
      });
      response.on('end', () => {
        clearTimeout(deadline);
        resolve({ status: response.statusCode || 502, headers, body: Buffer.concat(chunks) });
      });
    });

    request.setTimeout(timeoutMs, () => request.destroy(new Error('外部请求超时。')));
    request.on('error', (error) => {
      clearTimeout(deadline);
      reject(error);
    });
    if (options.body) request.write(options.body);
    request.end();
  });
}
