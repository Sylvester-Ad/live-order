import { Link } from "react-router-dom";

import { Brand } from "../../../components/layout/brand";
import { buttonClassName } from "../../../components/ui/button-styles";

const workflow = [
  { number: "01", title: "Set up your Store", detail: "Give your shop a name and a shareable address." },
  { number: "02", title: "Add what you sell", detail: "Add product photos, prices, stock and available options." },
  { number: "03", title: "Share your link", detail: "Add it to a post, bio or group chat, or send it directly to a customer." },
  { number: "04", title: "Keep orders together", detail: "Customers order through your Store; you manage each order in one place." },
];

const benefits = [
  { title: "A storefront that is ready to share", detail: "Give customers one place to browse your products and place an order, without building a website." },
  { title: "Products with the details people need", detail: "Show product images, prices, available stock and options such as size or colour." },
  { title: "Orders you can follow up on", detail: "See customer details, item choices, quantities, order totals and payment status together." },
  { title: "Payment status stays in your hands", detail: "Add your Store's Mobile Money instructions and mark payment status yourself after checking with the customer." },
  { title: "A useful record when you need it", detail: "Export your Store's orders to CSV for your own record keeping." },
  { title: "Your Store, your own settings", detail: "Manage products, orders and payment instructions separately for each Store." },
];

export function LandingPage() {
  return (
    <main className="overflow-hidden bg-white">
      <header className="border-b border-border bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-7 lg:px-10">
          <Brand link={false} />
          <nav aria-label="Main navigation" className="flex items-center gap-3 sm:gap-5">
            <a className="hidden text-sm font-semibold text-ink-muted hover:text-ink sm:inline" href="#how-it-works">How it works</a>
            <Link className="text-sm font-semibold text-ink-muted hover:text-ink" to="/login">Sign in</Link>
            <Link className={buttonClassName("primary", "sm")} to="/register">Create your Store</Link>
          </nav>
        </div>
      </header>

      <section className="relative isolate overflow-hidden bg-canvas">
        <div aria-hidden="true" className="pointer-events-none absolute -right-24 -top-28 size-[26rem] rounded-full bg-[#f4d8bd]/55 blur-3xl" />
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-40 left-[35%] size-[24rem] rounded-full bg-brand-100/65 blur-3xl" />
        <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-4 py-14 sm:px-7 sm:py-20 lg:grid-cols-[1fr_0.92fr] lg:gap-16 lg:px-10 lg:py-24">
          <div className="relative z-10">
            <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-brand-200 bg-white px-3 py-1.5 text-xs font-bold uppercase tracking-[0.13em] text-brand-800">
              <span aria-hidden="true" className="size-2 rounded-full bg-[#d77d4d]" />
              Made for independent sellers
            </p>
            <h1 className="max-w-2xl text-4xl font-bold leading-[1.06] tracking-tight text-ink sm:text-5xl lg:text-6xl">
              Turn your product posts into orders you can keep track of.
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-8 text-ink-muted sm:text-xl">
              Wherever customers find you—Instagram, TikTok, Facebook, WhatsApp or in person—share one Store link for browsing and ordering, then manage every order in one organised place.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Link className={buttonClassName("primary", "lg")} to="/register">Create your online Store <span aria-hidden="true" className="ml-2">→</span></Link>
              <Link className={buttonClassName("secondary", "lg")} to="/login">I already have an account</Link>
            </div>
            <p className="mt-4 text-sm text-ink-muted">No website to build. Customers can order without creating an account.</p>
          </div>
          <div aria-label="Preview of a customer Store and its seller order list" className="relative mx-auto w-full max-w-xl pb-8 sm:pb-10">
            <div aria-hidden="true" className="absolute -right-12 top-4 size-64 rounded-full bg-brand-100/70 blur-3xl" />
            <span className="absolute -right-1 top-0 z-30 inline-flex -translate-y-1/2 items-center gap-2 rounded-full border border-[#f0d4bd] bg-white px-3 py-2 text-xs font-bold text-ink shadow-card sm:right-1">
              <span aria-hidden="true" className="grid size-6 place-items-center rounded-full bg-[#fff0e3] text-[#a65532]">↗</span>
              One link to share
            </span>
            <span aria-hidden="true" className="absolute -left-2 top-16 z-20 text-2xl text-[#d77d4d] sm:-left-5">✦</span>
            <StorefrontPreview />
            <OrdersPreview />
          </div>
        </div>
      </section>

      <section aria-labelledby="problem-heading" className="mx-auto max-w-7xl px-4 py-16 sm:px-7 sm:py-20 lg:px-10">
        <div className="max-w-2xl">
          <p className="text-sm font-bold uppercase tracking-[0.14em] text-brand-700">Selling should feel simpler</p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-ink sm:text-4xl" id="problem-heading">Your products are everywhere. Orders are harder to keep together.</h2>
          <p className="mt-4 text-base leading-7 text-ink-muted">When a busy day of selling sends details across posts, messages and calls, keeping every order straight takes a lot of attention.</p>
        </div>
        <div className="mt-9 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <ProblemCard number="01" title="Promoting in many places" detail="You post in social feeds and groups, share Status updates, and tell customers about new products." />
          <ProblemCard number="02" title="Details get scattered" detail="Names, quantities, sizes and colours arrive through different conversations." />
          <ProblemCard number="03" title="Follow-ups take time" detail="You scroll back to remember who ordered what and who said they had paid." />
          <ProblemCard number="04" title="Too much to remember" detail="A notebook, screenshots and memory become the order system on a busy day." />
        </div>
      </section>

      <section className="bg-brand-900 text-white" id="how-it-works">
        <div className="mx-auto grid max-w-7xl gap-12 px-4 py-16 sm:px-7 sm:py-20 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20 lg:px-10">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.14em] text-brand-200">A calmer way to sell</p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Keep reaching customers your way. Keep orders together.</h2>
            <p className="mt-5 leading-7 text-white/75">Share your link in a post, bio, group chat or directly with a customer. LiveOrder does not import or sync messages; customers browse and order through your Store.</p>
            <Link className="mt-7 inline-flex min-h-12 items-center justify-center rounded-control bg-white px-5 text-base font-bold text-brand-900 transition hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-brand-900" to="/register">Start your Store <span aria-hidden="true" className="ml-2">→</span></Link>
          </div>
          <ol className="grid gap-0 sm:grid-cols-2">
            {workflow.map((step, index) => (
              <li className={`border-t border-white/20 py-5 sm:px-5 ${index % 2 === 0 ? "sm:pl-0 sm:pr-7" : "sm:pr-0 sm:pl-7"}`} key={step.number}>
                <p className="text-xs font-bold tracking-[0.15em] text-brand-200">STEP {step.number}</p>
                <h3 className="mt-3 text-xl font-bold">{step.title}</h3>
                <p className="mt-2 max-w-sm text-sm leading-6 text-white/70">{step.detail}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section aria-labelledby="features-heading" className="bg-canvas">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-7 sm:py-20 lg:px-10">
          <div className="max-w-2xl">
            <p className="text-sm font-bold uppercase tracking-[0.14em] text-brand-700">Made for the work behind every sale</p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight text-ink sm:text-4xl" id="features-heading">The pieces you need, together.</h2>
            <p className="mt-4 leading-7 text-ink-muted">A simple storefront for customers and a practical workspace for you.</p>
          </div>
          <div className="mt-9 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {benefits.map((benefit, index) => <BenefitCard key={benefit.title} index={index + 1} title={benefit.title} detail={benefit.detail} />)}
          </div>
        </div>
      </section>

      <section className="px-4 py-16 sm:px-7 sm:py-20 lg:px-10">
        <div className="mx-auto flex max-w-5xl flex-col items-start justify-between gap-7 rounded-panel bg-gradient-to-br from-brand-50 via-[#fffaf2] to-[#fce9dc] p-6 sm:p-9 lg:flex-row lg:items-center">
          <div className="max-w-2xl">
            <p className="text-sm font-bold uppercase tracking-[0.14em] text-brand-700">Your next order can be easier to track</p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight text-ink sm:text-4xl">Create your Store. Share the link. Keep orders in one place.</h2>
            <p className="mt-4 leading-7 text-ink-muted">Start with the products you already sell. You can keep reaching customers where you do today.</p>
          </div>
          <div className="flex w-full shrink-0 flex-col gap-3 sm:w-auto sm:flex-row">
            <Link className={buttonClassName("primary", "lg")} to="/register">Create a seller account</Link>
            <Link className={buttonClassName("secondary", "lg")} to="/login">Sign in</Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-border bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-6 sm:flex-row sm:items-center sm:justify-between sm:px-7 lg:px-10">
          <Brand link={false} />
          <p className="text-sm text-ink-muted">Your products, your customers, one organised place for orders.</p>
          <div className="flex items-center gap-5 text-sm font-semibold">
            <Link className="text-ink-muted hover:text-ink" to="/login">Sign in</Link>
            <Link className="text-brand-700 hover:text-brand-900" to="/register">Create a Store</Link>
          </div>
        </div>
      </footer>
    </main>
  );
}

function StorefrontPreview() {
  return <div className="relative z-10 ml-auto w-[min(100%,390px)] overflow-hidden rounded-[1.6rem] border border-border bg-white shadow-[0_30px_80px_rgb(18_63_56_/_18%)]">
    <div className="flex items-center justify-between border-b border-border px-4 py-3">
      <Brand link={false} />
      <span className="rounded-full bg-brand-50 px-2.5 py-1 text-[10px] font-bold text-brand-800">STORE PREVIEW</span>
    </div>
      <div className="relative h-32 overflow-hidden bg-[#c6a17a]">
        <img alt="Independent seller at work in a small product studio" className="size-full object-cover object-[center_65%]" height="256" src="/images/landing/seller-workspace.jpg" width="170" />
        <div className="absolute inset-0 bg-gradient-to-t from-brand-900/85 via-brand-900/15 to-transparent" />
        <div className="absolute inset-x-5 bottom-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/85">A customer storefront</p>
          <h3 className="mt-1 text-2xl font-bold tracking-tight text-white">Nia Finds</h3>
          <p className="mt-1 text-xs text-white/85">Everyday pieces, chosen with care.</p>
        </div>
      </div>
      <div className="bg-[#f7f2e9] px-5 py-4">
      <div className="mt-4 grid grid-cols-2 gap-3">
        <PreviewProduct image="/images/landing/weekend-tote.jpg" imageAlt="White printed canvas tote" name="Printed tote" price="GH₵ 85.00" detail="Everyday carry" />
        <PreviewProduct image="/images/landing/beach-slides.jpg" imageAlt="Yellow slide sandals resting on sand" name="Beach slides" price="GH₵ 120.00" detail="Easy slip-on" />
      </div>
      <span aria-hidden="true" className="mt-4 flex min-h-10 w-full items-center justify-center rounded-control bg-brand-700 px-4 text-xs font-bold text-white">Browse products</span>
    </div>
  </div>;
}

function PreviewProduct({ image, imageAlt, name, price, detail }: { image: string; imageAlt: string; name: string; price: string; detail: string }) {
  return <article className="overflow-hidden rounded-xl border border-black/5 bg-white shadow-sm transition duration-200 hover:-translate-y-1 hover:shadow-md motion-reduce:transition-none">
    <img alt={imageAlt} className="h-24 w-full object-cover" height="192" src={image} width="192" />
    <div className="p-2.5">
      <h4 className="truncate text-xs font-bold text-ink">{name}</h4>
      <p className="mt-1 text-xs font-bold text-brand-800">{price}</p>
      <p className="mt-1 truncate text-[10px] text-ink-muted">{detail}</p>
    </div>
  </article>;
}

function OrdersPreview() {
  return <div className="absolute -bottom-1 left-0 z-20 w-[min(78%,330px)] rounded-panel border border-border bg-white p-4 shadow-[0_18px_50px_rgb(19_42_37_/_16%)] sm:-left-4">
    <div className="flex items-center justify-between gap-3">
      <div><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-brand-700">Seller workspace</p><h3 className="mt-1 text-sm font-bold text-ink">Recent orders</h3></div>
      <span className="rounded-full bg-status-warn-bg px-2.5 py-1 text-[10px] font-bold text-status-warn-ink">Unpaid</span>
    </div>
    <div className="mt-3 divide-y divide-border text-xs">
      <div className="flex items-center justify-between gap-3 py-2.5"><div><p className="font-mono font-bold text-ink">ORD-1A7F</p><p className="mt-0.5 text-ink-muted">Ama · 2 lines</p></div><p className="font-bold text-ink">GH₵ 205.00</p></div>
      <div className="flex items-center justify-between gap-3 py-2.5"><div><p className="font-mono font-bold text-ink">ORD-92C4</p><p className="mt-0.5 text-ink-muted">Esi · 1 line</p></div><p className="font-bold text-ink">GH₵ 120.00</p></div>
    </div>
    <p className="mt-1 border-t border-border pt-2 text-[10px] leading-4 text-ink-muted">You confirm payment status yourself.</p>
  </div>;
}

function ProblemCard({ number, title, detail }: { number: string; title: string; detail: string }) {
  return <article className="rounded-panel border border-border bg-white p-5">
    <p className="text-xs font-bold tracking-[0.15em] text-brand-700">{number}</p>
    <h3 className="mt-4 text-lg font-bold text-ink">{title}</h3>
    <p className="mt-2 text-sm leading-6 text-ink-muted">{detail}</p>
  </article>;
}

function BenefitCard({ index, title, detail }: { index: number; title: string; detail: string }) {
  const accent = ["bg-brand-50 text-brand-800", "bg-[#fff0e3] text-[#99502f]", "bg-[#fff5d9] text-[#806019]"][((index - 1) % 3)];
  return <article className="rounded-panel border border-border bg-white p-5 shadow-card transition duration-200 hover:-translate-y-1 hover:shadow-md motion-reduce:transition-none">
    <div aria-hidden="true" className={`grid size-10 place-items-center rounded-xl text-sm font-bold ${accent}`}>{String(index).padStart(2, "0")}</div>
    <h3 className="mt-4 text-lg font-bold text-ink">{title}</h3>
    <p className="mt-2 text-sm leading-6 text-ink-muted">{detail}</p>
  </article>;
}
