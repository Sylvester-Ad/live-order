import { useEffect, useRef, type ReactNode } from "react";
import { Link } from "react-router-dom";

import { Brand } from "../../../components/layout/brand";
import { buttonClassName } from "../../../components/ui/button-styles";

export function LandingPage() {
  const storyRoot = useRef<HTMLElement>(null);

  useEffect(() => {
    const root = storyRoot.current;
    if (!root || typeof window.matchMedia !== "function") return;

    let cancelled = false;
    let revert: (() => void) | undefined;
    void Promise.all([import("gsap"), import("gsap/ScrollTrigger")]).then(
      ([gsapModule, scrollTriggerModule]) => {
        if (cancelled) return;

        const { gsap } = gsapModule;
        gsap.registerPlugin(scrollTriggerModule.ScrollTrigger);
        const media = gsap.matchMedia(root);
        media.add("(prefers-reduced-motion: no-preference)", () => {
          root
            .querySelectorAll<HTMLElement>("[data-reveal]")
            .forEach((element) => {
              gsap.fromTo(
                element,
                { autoAlpha: 0, y: 18 },
                {
                  autoAlpha: 1,
                  y: 0,
                  duration: 0.55,
                  ease: "power2.out",
                  immediateRender: false,
                  scrollTrigger: {
                    trigger: element,
                    start: "top 88%",
                    once: true,
                  },
                },
              );
            });

          const handoff = root.querySelector<HTMLElement>("[data-handoff]");
          const messages = handoff?.querySelectorAll<HTMLElement>(
            "[data-handoff-message]",
          );
          const orders = handoff?.querySelector<HTMLElement>(
            "[data-handoff-orders]",
          );
          if (!handoff || !messages?.length || !orders) return;

          const timeline = gsap.timeline({
            scrollTrigger: {
              trigger: handoff,
              start: "top 76%",
              end: "bottom 42%",
              scrub: 0.7,
            },
          });
          timeline
            .to(
              messages,
              { x: 42, y: 18, autoAlpha: 0.08, stagger: 0.06, ease: "none" },
              0,
            )
            .fromTo(
              orders,
              { y: 20, scale: 0.97, autoAlpha: 0.55 },
              { y: 0, scale: 1, autoAlpha: 1, ease: "none" },
              0,
            );
        });
        revert = () => media.revert();
      },
    );

    return () => {
      cancelled = true;
      revert?.();
    };
  }, []);

  return (
    <main className="overflow-hidden bg-white" ref={storyRoot}>
      <header className="border-b border-border bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-2 px-3 py-4 max-[360px]:gap-1 max-[360px]:px-2 sm:gap-4 sm:px-7 lg:px-10">
          <Brand link={false} />
          <nav
            aria-label="Main navigation"
            className="flex items-center gap-2 max-[360px]:gap-1 sm:gap-5"
          >
            <a
              className="hidden text-sm font-semibold text-ink-muted hover:text-ink sm:inline"
              href="#how-it-works"
            >
              How it works
            </a>
            <Link
              className="whitespace-nowrap text-sm font-semibold text-ink-muted hover:text-ink"
              to="/login"
            >
              Sign in
            </Link>
            <Link
              className={`${buttonClassName("primary", "sm")} whitespace-nowrap max-[360px]:px-2 max-[360px]:text-xs`}
              to="/register"
            >
              Create your Store
            </Link>
          </nav>
        </div>
      </header>

      <section className="relative isolate overflow-hidden bg-canvas">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-24 -top-28 size-104 rounded-full bg-[#f4d8bd]/55 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-40 left-[35%] size-96 rounded-full bg-brand-100/65 blur-3xl"
        />
        <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-4 py-14 sm:px-7 sm:py-20 lg:grid-cols-[1fr_0.92fr] lg:gap-16 lg:px-10 lg:py-24">
          <div className="relative z-10">
            <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-brand-200 bg-white px-3 py-1.5 text-xs font-bold uppercase tracking-[0.13em] text-brand-800">
              <span
                aria-hidden="true"
                className="size-2 rounded-full bg-[#d77d4d]"
              />
              Made for independent sellers
            </p>
            <h1 className="max-w-2xl text-4xl font-bold leading-[1.06] tracking-tight text-ink sm:text-5xl lg:text-6xl">
              Turn your product posts into orders you can keep track of.
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-8 text-ink-muted sm:text-xl">
              Wherever customers find you—Instagram, TikTok, Facebook, WhatsApp
              or in person—share one Store link for browsing and ordering, then
              manage every order in one organised place.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Link className={buttonClassName("primary", "lg")} to="/register">
                Create your online Store{" "}
                <span aria-hidden="true" className="ml-2">
                  →
                </span>
              </Link>
              <Link className={buttonClassName("secondary", "lg")} to="/login">
                I already have an account
              </Link>
            </div>
            <p className="mt-4 text-sm text-ink-muted">
              No website to build. Customers can order without creating an
              account.
            </p>
          </div>
          <div
            aria-label="Preview of a customer Store and its seller order list"
            className="relative mx-auto w-full max-w-xl pb-8 sm:pb-10"
          >
            <div
              aria-hidden="true"
              className="absolute -right-12 top-4 size-64 rounded-full bg-brand-100/70 blur-3xl"
            />
            <span className="absolute -right-1 top-0 z-30 inline-flex -translate-y-1/2 items-center gap-2 rounded-full border border-[#f0d4bd] bg-white px-3 py-2 text-xs font-bold text-ink shadow-card sm:right-1">
              <span
                aria-hidden="true"
                className="grid size-6 place-items-center rounded-full bg-[#fff0e3] text-[#a65532]"
              >
                ↗
              </span>
              One link to share
            </span>
            <span
              aria-hidden="true"
              className="absolute -left-2 top-16 z-20 text-2xl text-[#d77d4d] sm:-left-5"
            >
              ✦
            </span>
            <StorefrontPreview />
            <OrdersPreview />
          </div>
        </div>
      </section>

      <section
        aria-labelledby="problem-heading"
        className="mx-auto max-w-7xl px-4 py-14 sm:px-7 sm:py-16 lg:px-10"
      >
        <div className="max-w-xl" data-reveal>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-brand-700">
            The busy-day version
          </p>
          <h2
            className="mt-2 text-3xl font-bold tracking-tight text-ink sm:text-4xl"
            id="problem-heading"
          >
            Selling moves fast. Details get left behind.
          </h2>
        </div>
        <div className="mt-7 grid grid-cols-2 gap-x-4 gap-y-7 sm:gap-x-6 lg:grid-cols-4 lg:gap-6">
          <ProblemStory
            number="01"
            title="Promoting everywhere"
            detail="One product, shared place by place."
            scene={<PromotionScene />}
          />
          <ProblemStory
            number="02"
            title="Details split up"
            detail="Sizes, colours and quantities in different chats."
            scene={<ScatteredDetailsScene />}
          />
          <ProblemStory
            number="03"
            title="Follow-ups take time"
            detail="Order notes and payment screenshots mixed in."
            scene={<FollowUpScene />}
          />
          <ProblemStory
            number="04"
            title="Too much to remember"
            detail="A notebook, phone and memory doing the work."
            scene={<ManualWorkspaceScene />}
          />
        </div>
      </section>

      <section
        aria-labelledby="solution-heading"
        className="overflow-hidden bg-brand-900 text-white"
        id="how-it-works"
      >
        <div className="mx-auto max-w-7xl px-4 py-14 sm:px-7 sm:py-16 lg:px-10">
          <div className="grid items-end gap-6 lg:grid-cols-[0.8fr_1.2fr]">
            <div data-reveal>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-brand-200">
                A calmer way to sell
              </p>
              <h2
                className="mt-2 max-w-xl text-3xl font-bold tracking-tight sm:text-4xl"
                id="solution-heading"
              >
                Your link travels. Orders land here.
              </h2>
              <p className="mt-3 max-w-lg text-sm leading-6 text-white/75">
                Customers browse your Store and order there. Messages do not
                sync.
              </p>
              <Link
                className="mt-5 inline-flex min-h-12 items-center justify-center rounded-control bg-white px-5 text-base font-bold text-brand-900 transition hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-brand-900"
                to="/register"
              >
                Start your Store{" "}
                <span aria-hidden="true" className="ml-2">
                  →
                </span>
              </Link>
            </div>
            <div
              aria-label="Customer messages become clear order details in the seller workspace"
              className="grid items-center gap-4 sm:grid-cols-[1fr_auto_1.1fr]"
              data-handoff
              role="img"
            >
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-1">
                <MessageFragment
                  name="Afi"
                  detail="2 dresses · size M"
                  channel="WhatsApp"
                />
                <MessageFragment
                  name="Ama"
                  detail="I sent the money"
                  channel="Direct message"
                />
                <MessageFragment
                  name="Efua"
                  detail="Black shirt, please"
                  channel="Group chat"
                />
                <MessageFragment
                  name="Esi"
                  detail="Can you confirm?"
                  channel="WhatsApp"
                />
              </div>
              <span
                aria-hidden="true"
                className="hidden text-3xl text-brand-200 sm:block"
              >
                →
              </span>
              <OrdersStoryPreview />
            </div>
          </div>
        </div>
      </section>

      <section
        aria-labelledby="steps-heading"
        className="mx-auto max-w-7xl px-4 py-14 sm:px-7 sm:py-16 lg:px-10"
      >
        <div
          className="flex flex-wrap items-end justify-between gap-4"
          data-reveal
        >
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-brand-700">
              How it works
            </p>
            <h2
              className="mt-2 text-3xl font-bold tracking-tight text-ink sm:text-4xl"
              id="steps-heading"
            >
              From Store name to customer order.
            </h2>
          </div>
          <span className="hidden text-sm font-semibold text-ink-muted sm:block">
            01 <span className="text-brand-600">→</span> 02{" "}
            <span className="text-brand-600">→</span> 03{" "}
            <span className="text-brand-600">→</span> 04
          </span>
        </div>
        <ol className="mt-7 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <WorkflowStep
            number="01"
            title="Set up your Store"
            visual={<StoreSetupVisual />}
          />
          <WorkflowStep
            number="02"
            title="Add what you sell"
            visual={<AddProductVisual />}
          />
          <WorkflowStep
            number="03"
            title="Share your link"
            visual={<ShareLinkVisual />}
          />
          <WorkflowStep
            number="04"
            title="Keep orders together"
            visual={<CustomerOrderVisual />}
          />
        </ol>
      </section>

      <section aria-labelledby="features-heading" className="bg-canvas">
        <div className="mx-auto max-w-7xl px-4 py-14 sm:px-7 sm:py-16 lg:px-10">
          <div className="mb-7" data-reveal>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-brand-700">
              Made for the work behind every sale
            </p>
            <h2
              className="mt-2 text-3xl font-bold tracking-tight text-ink sm:text-4xl"
              id="features-heading"
            >
              One Store. All the moving pieces.
            </h2>
          </div>
          <div className="grid gap-5 lg:grid-cols-3">
            <FeatureShowcase
              title="A Store customers can browse"
              detail="Photos, prices, stock and options."
              visual={<StoreProductsFeature />}
            />
            <FeatureShowcase
              title="Orders you can follow"
              detail="Customer, items, quantity and total."
              visual={<OrdersFeature />}
            />
            <FeatureShowcase
              title="Payment and records, your way"
              detail="Your instructions. Your payment checks. CSV when you need it."
              visual={<SettingsExportFeature />}
            />
          </div>
        </div>
      </section>

      <section className="px-4 py-16 sm:px-7 sm:py-20 lg:px-10">
        <div
          className="mx-auto flex max-w-5xl flex-col items-start justify-between gap-6 rounded-panel bg-linear-to-br from-brand-50 via-[#fffaf2] to-[#fce9dc] p-6 sm:p-8 lg:flex-row lg:items-center"
          data-reveal
        >
          <div className="max-w-2xl">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-brand-700">
              Ready when you are
            </p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight text-ink sm:text-4xl">
              Start with one Store.
            </h2>
          </div>
          <div className="flex w-full shrink-0 flex-col gap-3 sm:w-auto sm:flex-row">
            <Link className={buttonClassName("primary", "lg")} to="/register">
              Create your Store
            </Link>
            <Link className={buttonClassName("secondary", "lg")} to="/login">
              Sign in
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-border bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-6 sm:flex-row sm:items-center sm:justify-between sm:px-7 lg:px-10">
          <Brand link={false} />
          <p className="text-sm text-ink-muted">
            Your products. Your customers. One place for orders.
          </p>
          <div className="flex items-center gap-5 text-sm font-semibold">
            <Link className="text-ink-muted hover:text-ink" to="/login">
              Sign in
            </Link>
            <Link
              className="text-brand-700 hover:text-brand-900"
              to="/register"
            >
              Create a Store
            </Link>
          </div>
        </div>
      </footer>
    </main>
  );
}

function StorefrontPreview() {
  return (
    <div className="relative z-10 ml-auto w-[min(100%,390px)] overflow-hidden rounded-[1.6rem] border border-border bg-white shadow-[0_30px_80px_rgb(18_63_56/18%)]">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <Brand link={false} />
        <span className="rounded-full bg-brand-50 px-2.5 py-1 text-[10px] font-bold text-brand-800">
          STORE PREVIEW
        </span>
      </div>
      <div className="relative h-32 overflow-hidden bg-[#c6a17a]">
        <img
          alt="Independent seller at work in a small product studio"
          className="size-full object-cover object-[center_65%]"
          height="256"
          src="/images/landing/seller-workspace.jpg"
          width="170"
        />
        <div className="absolute inset-0 bg-linear-to-t from-brand-900/85 via-brand-900/15 to-transparent" />
        <div className="absolute inset-x-5 bottom-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/85">
            A customer storefront
          </p>
          <h3 className="mt-1 text-2xl font-bold tracking-tight text-white">
            Nia Finds
          </h3>
          <p className="mt-1 text-xs text-white/85">
            Everyday pieces, chosen with care.
          </p>
        </div>
      </div>
      <div className="bg-[#f7f2e9] px-5 py-4">
        <div className="mt-4 grid grid-cols-2 gap-3">
          <PreviewProduct
            image="/images/landing/weekend-tote.jpg"
            imageAlt="White printed canvas tote"
            name="Printed tote"
            price="GH₵ 85.00"
            detail="Everyday carry"
          />
          <PreviewProduct
            image="/images/landing/beach-slides.jpg"
            imageAlt="Yellow slide sandals resting on sand"
            name="Beach slides"
            price="GH₵ 120.00"
            detail="Easy slip-on"
          />
        </div>
        <span
          aria-hidden="true"
          className="mt-4 flex min-h-10 w-full items-center justify-center rounded-control bg-brand-700 px-4 text-xs font-bold text-white"
        >
          Browse products
        </span>
      </div>
    </div>
  );
}

function PreviewProduct({
  image,
  imageAlt,
  name,
  price,
  detail,
}: {
  image: string;
  imageAlt: string;
  name: string;
  price: string;
  detail: string;
}) {
  return (
    <article className="overflow-hidden rounded-xl border border-black/5 bg-white shadow-sm transition duration-200 hover:-translate-y-1 hover:shadow-md motion-reduce:transition-none">
      <img
        alt={imageAlt}
        className="h-24 w-full object-cover"
        height="192"
        src={image}
        width="192"
      />
      <div className="p-2.5">
        <h4 className="truncate text-xs font-bold text-ink">{name}</h4>
        <p className="mt-1 text-xs font-bold text-brand-800">{price}</p>
        <p className="mt-1 truncate text-[10px] text-ink-muted">{detail}</p>
      </div>
    </article>
  );
}

function OrdersPreview() {
  return (
    <div className="absolute -bottom-1 left-0 z-20 w-[min(78%,330px)] rounded-panel border border-border bg-white p-4 shadow-[0_18px_50px_rgb(19_42_37/16%)] sm:-left-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-brand-700">
            Seller workspace
          </p>
          <h3 className="mt-1 text-sm font-bold text-ink">Recent orders</h3>
        </div>
        <span className="rounded-full bg-status-warn-bg px-2.5 py-1 text-[10px] font-bold text-status-warn-ink">
          Unpaid
        </span>
      </div>
      <div className="mt-3 divide-y divide-border text-xs">
        <div className="flex items-center justify-between gap-3 py-2.5">
          <div>
            <p className="font-mono font-bold text-ink">ORD-1A7F</p>
            <p className="mt-0.5 text-ink-muted">Ama · 2 lines</p>
          </div>
          <p className="font-bold text-ink">GH₵ 205.00</p>
        </div>
        <div className="flex items-center justify-between gap-3 py-2.5">
          <div>
            <p className="font-mono font-bold text-ink">ORD-92C4</p>
            <p className="mt-0.5 text-ink-muted">Esi · 1 line</p>
          </div>
          <p className="font-bold text-ink">GH₵ 120.00</p>
        </div>
      </div>
      <p className="mt-1 border-t border-border pt-2 text-[10px] leading-4 text-ink-muted">
        You confirm payment status yourself.
      </p>
    </div>
  );
}

function ProblemStory({
  number,
  title,
  detail,
  scene,
}: {
  number: string;
  title: string;
  detail: string;
  scene: ReactNode;
}) {
  return (
    <article className="min-w-0" data-reveal>
      <figure className="relative flex min-h-48 items-center justify-center overflow-hidden rounded-panel bg-canvas p-3 sm:min-h-56 sm:p-4">
        {scene}
      </figure>
      <div className="mt-3 flex items-baseline gap-2">
        <span className="text-xs font-bold tabular-nums text-brand-700">
          {number}
        </span>
        <h3 className="text-sm font-bold leading-5 text-ink sm:text-base">
          {title}
        </h3>
      </div>
      <p className="mt-1 pl-7 text-xs leading-5 text-ink-muted sm:text-sm">
        {detail}
      </p>
    </article>
  );
}

function PromotionScene() {
  return (
    <div
      aria-label="One tote product shared separately to WhatsApp Status, a group, social posts and a customer"
      className="relative w-full max-w-56"
      role="img"
    >
      <div className="absolute inset-x-7 top-8 grid grid-cols-2 gap-2">
        <ChannelChip
          mark="WA"
          name="Status"
          color="bg-[#e6f4ea] text-[#167343]"
        />
        <ChannelChip
          mark="WA"
          name="Group"
          color="bg-[#e6f4ea] text-[#167343]"
        />
        <ChannelChip
          mark="◎"
          name="Social post"
          color="bg-[#fff0e3] text-[#9a5234]"
        />
        <ChannelChip mark="↗" name="A customer" color="bg-white text-ink" />
      </div>
      <div className="relative z-10 mx-auto w-28 overflow-hidden rounded-xl border border-border bg-white p-1.5 shadow-card">
        <img
          alt=""
          className="h-24 w-full rounded-lg object-cover"
          height="192"
          src="/images/landing/weekend-tote.jpg"
          width="192"
        />
        <p className="truncate px-1 pt-1.5 text-[10px] font-bold text-ink">
          Printed tote · GH₵85
        </p>
      </div>
      <span className="absolute left-1/2 top-1/2 z-0 size-32 -translate-x-1/2 -translate-y-1/2 rounded-full border border-dashed border-brand-300" />
    </div>
  );
}

function ChannelChip({
  mark,
  name,
  color,
}: {
  mark: string;
  name: string;
  color: string;
}) {
  return (
    <span
      className={`flex min-w-0 items-center gap-1.5 rounded-lg px-2 py-1.5 shadow-sm ${color}`}
    >
      <span className="grid size-5 shrink-0 place-items-center rounded-md bg-white/80 text-[9px] font-black">
        {mark}
      </span>
      <span className="truncate text-[9px] font-semibold">{name}</span>
    </span>
  );
}

function ScatteredDetailsScene() {
  return (
    <div
      aria-label="Different customer chats contain product, size, colour and quantity details"
      className="grid w-full max-w-60 grid-cols-2 gap-2"
      role="img"
    >
      <ChatBubble name="Ama" text="Black shirt, please" tone="bg-white" />
      <ChatBubble name="Esi" text="Two dresses, size M" tone="bg-[#e5f4e8]" />
      <ChatBubble name="Efua" text="What sizes are left?" tone="bg-[#fff0e3]" />
      <ChatBubble name="Akos" text="I’ll take 3" tone="bg-white" />
    </div>
  );
}

function ChatBubble({
  name,
  text,
  tone,
}: {
  name: string;
  text: string;
  tone: string;
}) {
  return (
    <div className={`min-w-0 rounded-xl p-2.5 shadow-sm ${tone}`}>
      <p className="text-[9px] font-bold text-brand-800">{name}</p>
      <p className="mt-1 text-[10px] font-medium leading-4 text-ink">{text}</p>
      <span className="mt-1 block text-right text-[8px] text-ink-faint">
        WhatsApp
      </span>
    </div>
  );
}

function FollowUpScene() {
  return (
    <div
      aria-label="Order questions and payment screenshots mixed into a long conversation"
      className="relative w-full max-w-56 rounded-2xl border border-border bg-white p-3 shadow-card"
      role="img"
    >
      <div className="mb-2 flex items-center gap-2 border-b border-border pb-2">
        <span className="grid size-6 place-items-center rounded-full bg-brand-100 text-[9px] font-bold text-brand-800">
          A
        </span>
        <span className="text-[10px] font-bold text-ink">Ama · chat</span>
      </div>
      <div className="space-y-1.5">
        <p className="w-4/5 rounded-lg bg-canvas px-2 py-1.5 text-[9px] text-ink">
          Please reserve one for me.
        </p>
        <p className="ml-auto w-3/4 rounded-lg bg-[#e6f4ea] px-2 py-1.5 text-[9px] text-ink">
          I sent the money.
        </p>
        <div className="ml-auto w-24 rounded-md border border-dashed border-brand-300 bg-brand-50 p-2 text-center">
          <span className="block text-sm text-brand-700">▧</span>
          <span className="text-[8px] font-semibold text-brand-800">
            payment screenshot
          </span>
        </div>
        <p className="w-4/5 rounded-lg bg-canvas px-2 py-1.5 text-[9px] text-ink">
          Which colour did I order?
        </p>
      </div>
      <span className="absolute right-2 top-1/2 rounded-full bg-[#fff0e3] px-2 py-1 text-[8px] font-bold text-[#9a5234]">
        scroll to find
      </span>
    </div>
  );
}

function ManualWorkspaceScene() {
  return (
    <div
      aria-label="A busy desk with handwritten order notes, a phone and calculator"
      className="relative h-40 w-full max-w-60"
      role="img"
    >
      <div className="absolute left-1 top-4 w-32 -rotate-6 rounded-md bg-[#fff6d8] p-3 shadow-md">
        <p className="text-[9px] font-bold text-[#806019]">Today’s orders</p>
        <p className="mt-2 border-b border-dashed border-[#d6bf7b] pb-1 text-[9px] text-ink">
          Ama · 2 dresses
        </p>
        <p className="mt-1 border-b border-dashed border-[#d6bf7b] pb-1 text-[9px] text-ink">
          Efua · black M
        </p>
        <p className="mt-1 text-[8px] text-ink-muted">paid? ask again</p>
      </div>
      <div className="absolute right-3 top-1 z-10 w-20 rotate-6 rounded-2xl border-[3px] border-ink bg-white p-1 shadow-md">
        <div className="space-y-1 rounded-xl bg-canvas p-1.5">
          <span className="block h-8 rounded bg-[#fff0e3]" />
          <span className="block h-8 rounded bg-[#e6f4ea]" />
          <span className="block h-8 rounded bg-white" />
        </div>
      </div>
      <div className="absolute bottom-1 right-7 rounded-lg bg-brand-900 px-3 py-2 text-center text-white shadow-md">
        <p className="text-[8px] uppercase tracking-wide text-white/70">calc</p>
        <p className="font-mono text-xs font-bold">205.00</p>
      </div>
      <span className="absolute bottom-2 left-5 rotate-12 rounded bg-white px-2 py-1 text-[8px] font-bold text-[#9a5234] shadow">
        call back
      </span>
    </div>
  );
}

function MessageFragment({
  name,
  detail,
  channel,
}: {
  name: string;
  detail: string;
  channel: string;
}) {
  return (
    <div
      className="rounded-xl border border-white/10 bg-white/10 p-2.5"
      data-handoff-message
    >
      <p className="text-[9px] font-bold text-brand-100">
        {name} · {channel}
      </p>
      <p className="mt-1 text-[10px] font-medium leading-4 text-white">
        {detail}
      </p>
    </div>
  );
}

function OrdersStoryPreview() {
  return (
    <div
      className="rounded-panel bg-white p-3 text-ink shadow-card"
      data-handoff-orders
    >
      <p className="text-[9px] font-bold uppercase tracking-wide text-brand-700">
        Seller orders
      </p>
      <div className="mt-2 flex items-center justify-between gap-2 border-b border-border pb-2">
        <div>
          <p className="text-[10px] font-bold">Ama</p>
          <p className="text-[9px] text-ink-muted">2 dresses · size M</p>
        </div>
        <p className="text-[10px] font-bold">GH₵ 240</p>
      </div>
      <div className="flex items-center justify-between gap-2 pt-2">
        <div>
          <p className="text-[10px] font-bold">Efua</p>
          <p className="text-[9px] text-ink-muted">Black shirt · 1</p>
        </div>
        <span className="rounded-full bg-status-warn-bg px-2 py-1 text-[8px] font-bold text-status-warn-ink">
          Pending
        </span>
      </div>
    </div>
  );
}

function WorkflowStep({
  number,
  title,
  visual,
}: {
  number: string;
  title: string;
  visual: ReactNode;
}) {
  return (
    <li className="min-w-0" data-reveal>
      <figure className="flex min-h-44 items-center justify-center overflow-hidden rounded-panel bg-white p-4 shadow-card sm:min-h-48">
        {visual}
      </figure>
      <div className="mt-3 flex items-center gap-2">
        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-brand-100 text-[10px] font-bold text-brand-800">
          {number}
        </span>
        <h3 className="text-sm font-bold text-ink">{title}</h3>
      </div>
    </li>
  );
}

function StoreSetupVisual() {
  return (
    <div className="w-full max-w-52 rounded-xl border border-border bg-white p-3">
      <p className="text-[10px] font-bold text-ink">Name your Store</p>
      <div className="mt-2 rounded-md border border-border px-2.5 py-2 text-[10px] text-ink-muted">
        Nia Finds
      </div>
      <p className="mt-3 text-[8px] font-bold uppercase tracking-wide text-ink-faint">
        Your Store link
      </p>
      <div className="mt-1 flex items-center justify-between gap-2 rounded-md bg-brand-50 px-2.5 py-2">
        <span className="truncate text-[9px] font-semibold text-brand-800">
          liveorder.app/nia-finds
        </span>
        <span className="text-[9px] font-bold text-brand-700">↗</span>
      </div>
    </div>
  );
}

function AddProductVisual() {
  return (
    <div className="grid w-full max-w-56 grid-cols-2 gap-2">
      <MiniCatalogProduct
        image="/images/landing/weekend-tote.jpg"
        name="Printed tote"
        price="GH₵ 85"
        options="In stock · 3 colours"
      />
      <MiniCatalogProduct
        image="/images/landing/beach-slides.jpg"
        name="Beach slides"
        price="GH₵ 120"
        options="Sizes 37–40"
      />
    </div>
  );
}

function MiniCatalogProduct({
  image,
  name,
  price,
  options,
}: {
  image: string;
  name: string;
  price: string;
  options: string;
}) {
  return (
    <div className="min-w-0 overflow-hidden rounded-lg border border-border bg-white">
      <img alt="" className="h-16 w-full object-cover" src={image} />
      <div className="p-2">
        <p className="truncate text-[9px] font-bold text-ink">{name}</p>
        <p className="mt-0.5 text-[9px] font-bold text-brand-800">{price}</p>
        <p className="mt-1 truncate text-[8px] text-ink-muted">{options}</p>
      </div>
    </div>
  );
}

function ShareLinkVisual() {
  return (
    <div className="w-full max-w-52 rounded-xl border border-border bg-white p-3">
      <div className="flex items-center gap-2">
        <span className="grid size-7 place-items-center rounded-full bg-[#e6f4ea] text-[10px] font-black text-[#167343]">
          WA
        </span>
        <div>
          <p className="text-[9px] font-bold text-ink">Share with customers</p>
          <p className="text-[8px] text-ink-muted">Group · Status · direct</p>
        </div>
      </div>
      <div className="mt-3 rounded-lg bg-canvas p-2.5">
        <p className="text-[9px] leading-4 text-ink">
          New pieces are here. Take a look at my Store:
        </p>
        <p className="mt-1 truncate text-[9px] font-bold text-brand-700">
          liveorder.app/nia-finds
        </p>
      </div>
      <div className="mt-2 flex justify-end">
        <span className="rounded-full bg-brand-700 px-3 py-1 text-[8px] font-bold text-white">
          Copy link
        </span>
      </div>
    </div>
  );
}

function CustomerOrderVisual() {
  return (
    <div className="flex w-full max-w-56 items-center gap-2">
      <div className="min-w-0 flex-1 rounded-xl border border-border bg-white p-2">
        <img
          alt=""
          className="h-16 w-full rounded-md object-cover"
          src="/images/landing/weekend-tote.jpg"
        />
        <p className="mt-1 truncate text-[9px] font-bold text-ink">
          Printed tote
        </p>
        <p className="text-[9px] font-bold text-brand-800">GH₵ 85</p>
        <span className="mt-1 block rounded bg-brand-50 px-2 py-1 text-center text-[8px] font-bold text-brand-800">
          Place order
        </span>
      </div>
      <span aria-hidden="true" className="text-lg font-bold text-brand-600">
        →
      </span>
      <div className="min-w-0 flex-1 rounded-xl border border-border bg-white p-2 shadow-card">
        <p className="text-[8px] font-bold uppercase text-brand-700">
          New order
        </p>
        <p className="mt-2 text-[9px] font-bold text-ink">Customer</p>
        <p className="text-[8px] text-ink-muted">1 × Printed tote</p>
        <p className="mt-2 border-t border-border pt-1 text-[9px] font-bold text-ink">
          GH₵ 85 · Pending
        </p>
      </div>
    </div>
  );
}

function FeatureShowcase({
  title,
  detail,
  visual,
}: {
  title: string;
  detail: string;
  visual: ReactNode;
}) {
  return (
    <article className="min-w-0" data-reveal>
      <figure className="flex min-h-56 items-center justify-center overflow-hidden rounded-panel bg-white p-4 shadow-card sm:min-h-64">
        {visual}
      </figure>
      <h3 className="mt-4 text-base font-bold text-ink">{title}</h3>
      <p className="mt-1 text-sm leading-5 text-ink-muted">{detail}</p>
    </article>
  );
}

function StoreProductsFeature() {
  return (
    <div className="w-full max-w-64">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs font-bold text-ink">Nia Finds</p>
        <span className="rounded-full bg-brand-50 px-2 py-1 text-[8px] font-bold text-brand-800">
          Store
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <MiniCatalogProduct
          image="/images/landing/weekend-tote.jpg"
          name="Printed tote"
          price="GH₵ 85"
          options="Stock 8 · 3 colours"
        />
        <MiniCatalogProduct
          image="/images/landing/beach-slides.jpg"
          name="Beach slides"
          price="GH₵ 120"
          options="Stock 4 · sizes 37–40"
        />
      </div>
    </div>
  );
}

function OrdersFeature() {
  return (
    <div className="w-full max-w-64 overflow-hidden rounded-lg border border-border bg-white">
      <div className="grid grid-cols-[1fr_auto_auto] gap-3 bg-canvas px-3 py-2 text-[8px] font-bold uppercase tracking-wide text-ink-muted">
        <span>Customer</span>
        <span>Items</span>
        <span>Total</span>
      </div>
      <div className="grid grid-cols-[1fr_auto_auto] items-center gap-3 border-t border-border px-3 py-3 text-[9px]">
        <div>
          <p className="font-bold text-ink">Ama Mensah</p>
          <p className="mt-0.5 text-ink-muted">ORD-1A7F</p>
        </div>
        <span className="text-ink-muted">2 dresses · M</span>
        <span className="font-bold text-ink">GH₵ 240</span>
      </div>
      <div className="grid grid-cols-[1fr_auto_auto] items-center gap-3 border-t border-border px-3 py-3 text-[9px]">
        <div>
          <p className="font-bold text-ink">Efua Boateng</p>
          <p className="mt-0.5 text-ink-muted">ORD-92C4</p>
        </div>
        <span className="text-ink-muted">Black shirt · 1</span>
        <span className="font-bold text-ink">GH₵ 125</span>
      </div>
    </div>
  );
}

function SettingsExportFeature() {
  return (
    <div className="w-full max-w-64 space-y-2">
      <div className="rounded-lg border border-border bg-white p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] font-bold text-ink">
            Store payment details
          </p>
          <span className="text-[8px] font-semibold text-brand-700">
            Seller set
          </span>
        </div>
        <p className="mt-1 text-[9px] text-ink-muted">
          Mobile Money · 024 *** 6712
        </p>
      </div>
      <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-white p-3">
        <div>
          <p className="text-[10px] font-bold text-ink">Order payment</p>
          <p className="mt-1 text-[9px] text-ink-muted">
            Seller marks it after checking
          </p>
        </div>
        <span className="rounded-full bg-status-warn-bg px-2 py-1 text-[8px] font-bold text-status-warn-ink">
          Pending
        </span>
      </div>
      <div className="flex items-center justify-between gap-2 rounded-lg bg-brand-900 px-3 py-2.5 text-white">
        <div>
          <p className="text-[9px] font-bold">Nia Finds settings</p>
          <p className="text-[8px] text-white/70">Store details · payment</p>
        </div>
        <span className="rounded bg-white/15 px-2 py-1 text-[8px] font-bold">
          CSV ↓
        </span>
      </div>
    </div>
  );
}
