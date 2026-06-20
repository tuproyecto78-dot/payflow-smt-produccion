"use client";
import { useEffect } from "react";

export function useLandingAnimations(rootRef: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!rootRef.current) return;
    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) return;
    let ctx: { revert: () => void } | undefined;
    let cleanup = () => {};
    (async () => {
      const { gsap } = await import("gsap");
      const { ScrollTrigger } = await import("gsap/ScrollTrigger");
      gsap.registerPlugin(ScrollTrigger);
      const q = (sel: string) => Array.from(rootRef.current?.querySelectorAll(sel) ?? []);
      ctx = gsap.context(() => {
        const heroBg = q("[data-hero-bg]")[0] as HTMLElement | undefined;
        if (heroBg) gsap.to(heroBg, { yPercent: 18, ease: "none", scrollTrigger: { trigger: heroBg.closest("section"), start: "top top", end: "bottom top", scrub: 1.2 } });
        const heroLogo = q("[data-hero-logo]")[0] as HTMLElement | undefined;
        if (heroLogo) gsap.from(heroLogo, { opacity: 0, y: 28, scale: 0.9, duration: 1.1, ease: "power3.out", delay: 0.15 });
        const heroTitle = q("[data-hero-title]")[0] as HTMLElement | undefined;
        if (heroTitle) gsap.from(heroTitle, { opacity: 0, y: 36, duration: 1.1, ease: "power3.out", delay: 0.35 });
        const heroCards = q("[data-hero-card]") as HTMLElement[];
        if (heroCards.length > 0) gsap.from(heroCards, { opacity: 0, y: 24, duration: 0.7, ease: "power2.out", stagger: 0.12, delay: 0.6 });
        const platformImg = q("[data-platform-img]")[0] as HTMLElement | undefined;
        if (platformImg) gsap.fromTo(platformImg, { scale: 0.92, opacity: 0, y: 40 }, { scale: 1.05, opacity: 1, y: 0, duration: 1.4, ease: "power2.out", scrollTrigger: { trigger: platformImg, start: "top 85%", end: "bottom 60%", scrub: 1 } });
        const benefitCards = q("[data-benefit-card]") as HTMLElement[];
        benefitCards.forEach((card) => gsap.from(card, { opacity: 0, y: 36, duration: 0.8, ease: "power2.out", scrollTrigger: { trigger: card, start: "top 88%", toggleActions: "play none none none" } }));
        const priceCards = q("[data-price-card]") as HTMLElement[];
        priceCards.forEach((card, i) => gsap.from(card, { opacity: 0, y: 44, scale: 0.96, duration: 0.9, ease: "power3.out", delay: i * 0.12, scrollTrigger: { trigger: card, start: "top 90%", toggleActions: "play none none none" } }));
        const nosotrosBlocks = q("[data-nosotros-block]") as HTMLElement[];
        nosotrosBlocks.forEach((block) => gsap.from(block, { opacity: 0, y: 32, duration: 0.9, ease: "power2.out", scrollTrigger: { trigger: block, start: "top 85%", toggleActions: "play none none none" } }));
      }, rootRef);
      cleanup = () => { ctx?.revert(); ScrollTrigger.getAll().forEach((t) => t.kill()); };
    })();
    return () => { cleanup(); };
  }, [rootRef]);
}
