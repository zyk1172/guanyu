import SecureCheckout from '@/components/SecureCheckout';

export const metadata = { robots: { index: false, follow: false } };

export default async function CheckoutPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <SecureCheckout key={id} id={id} />;
}
