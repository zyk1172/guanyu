import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const uiSystem = {
  rules: {
    "no-control-style-overrides": {
      meta: { type: "problem", schema: [], messages: { drift: "{{component}} owns its geometry, typography and state styling. Use a documented variant; keep call-site classes for layout only." } },
      create(context) {
        return {
          JSXOpeningElement(node) {
            const component = node.name.name;
            if (!["Button", "ButtonLink", "ActionLink", "Input", "Select", "Textarea", "Panel"].includes(component)) return;
            const attribute = node.attributes.find(item => item.type === "JSXAttribute" && item.name.name === "className");
            if (!attribute?.value) return;
            const value = context.sourceCode.getText(attribute.value);
            const geometry = /(?:^|[\s"'`])(?:[\w-]+:)*(?:p[trblxy]?-|rounded|border(?:-|\b)|bg-|shadow)/;
            const control = /(?:^|[\s"'`])(?:[\w-]+:)*(?:h-|min-h-|font-|text-(?:xxs|xs|sm|base|lg|xl|\[)|leading-|tracking-|ring-|outline-)/;
            if (geometry.test(value) || (component !== "Panel" && control.test(value))) context.report({ node: attribute, messageId: "drift", data: { component } });
          },
        };
      },
    },
  },
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "react-hooks/immutability": "off",
      "react-hooks/set-state-in-effect": "off",
    },
  },
  {
    files: ["app/**/*.tsx", "components/**/*.tsx"],
    ignores: ["components/ui/**"],
    plugins: { "ui-system": uiSystem },
    rules: {
      "ui-system/no-control-style-overrides": "error",
      "no-restricted-syntax": ["error",
        { selector: "JSXOpeningElement[name.name=/^(button|input|select|textarea)$/]", message: "Use the shared controls from components/ui/controls.tsx; geometry and states are defined by DESIGN.md." },
        { selector: "CallExpression[callee.object.name='window'][callee.property.name=/^(confirm|prompt)$/]", message: "Use useConfirmation() so dialogs share accessible focus, keyboard and visual behavior." },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
