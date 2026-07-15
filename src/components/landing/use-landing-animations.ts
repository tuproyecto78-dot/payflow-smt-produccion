"use client";
import { useEffect } from "react";

export function useLandingAnimations(rootRef: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!rootRef.current) return;

    let cleanup = () => {};
    let cancelled = false;

    (async () => {
      try {
        const { gsap } = await import("gsap");
        const { ScrollTrigger } = await import("gsap/ScrollTrigger");
        if (cancelled || !rootRef.current) return;

        gsap.registerPlugin(ScrollTrigger);
        const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        if (prefersReduced) return;

        const q = (sel: string) => Array.from(rootRef.current?.querySelectorAll(sel) ?? []);
        let ctx: { revert: () => void } | undefined;

        ctx = gsap.context(() => {
          // ---- HERO ----
          const heroBg = q("[data-hero-bg]")[0] as HTMLElement | undefined;
          if (heroBg)
            gsap.to(heroBg, {
              yPercent: 18,
              ease: "none",
              scrollTrigger: { trigger: heroBg.closest("section"), start: "top top", end: "bottom top", scrub: 1.2 },
            });

          const heroLogo = q("[data-hero-logo]")[0] as HTMLElement | undefined;
          if (heroLogo) gsap.from(heroLogo, { opacity: 0, y: 28, scale: 0.9, duration: 1.1, ease: "power3.out", delay: 0.15 });

          const heroBadge = q("[data-hero-badge]")[0] as HTMLElement | undefined;
          if (heroBadge) gsap.from(heroBadge, { opacity: 0, y: 20, duration: 0.8, ease: "power2.out", delay: 0.25 });

          const heroTitle = q("[data-hero-title]")[0] as HTMLElement | undefined;
          if (heroTitle) gsap.from(heroTitle, { opacity: 0, y: 36, duration: 1.1, ease: "power3.out", delay: 0.35 });

          const heroDesc = q("[data-hero-desc]")[0] as HTMLElement | undefined;
          if (heroDesc) gsap.from(heroDesc, { opacity: 0, y: 24, duration: 0.9, ease: "power2.out", delay: 0.5 });

          const heroCards = q("[data-hero-card]") as HTMLElement[];
          if (heroCards.length > 0)
            gsap.from(heroCards, { opacity: 0, y: 24, duration: 0.7, ease: "power2.out", stagger: 0.1, delay: 0.65 });

          const heroCta = q("[data-hero-cta]")[0] as HTMLElement | undefined;
          if (heroCta) gsap.from(heroCta, { opacity: 0, y: 20, duration: 0.8, ease: "power2.out", delay: 0.85 });

          const heroTrust = q("[data-hero-trust]")[0] as HTMLElement | undefined;
          if (heroTrust) gsap.from(heroTrust, { opacity: 0, duration: 1, ease: "power2.out", delay: 1 });

          // Hero mockup + floating cards
          const heroMockup = q("[data-hero-mockup]")[0] as HTMLElement | undefined;
          if (heroMockup) {
            gsap.from(heroMockup, { opacity: 0, x: 60, scale: 0.92, duration: 1.3, ease: "power3.out", delay: 0.6 });
            gsap.to(heroMockup, {
              yPercent: -8,
              ease: "none",
              scrollTrigger: { trigger: heroMockup.closest("section"), start: "top top", end: "bottom top", scrub: 1.5 },
            });
          }

          const float1 = q("[data-float-card-1]")[0] as HTMLElement | undefined;
          if (float1) gsap.to(float1, { y: -10, duration: 2.2, ease: "sine.inOut", yoyo: true, repeat: -1, delay: 1.2 });

          const float2 = q("[data-float-card-2]")[0] as HTMLElement | undefined;
          if (float2) gsap.to(float2, { y: 10, duration: 2.6, ease: "sine.inOut", yoyo: true, repeat: -1, delay: 1.4 });

          const float3 = q("[data-float-card-3]")[0] as HTMLElement | undefined;
          if (float3) gsap.to(float3, { y: -8, duration: 2.4, ease: "sine.inOut", yoyo: true, repeat: -1, delay: 1.6 });

          const float4 = q("[data-float-card-4]")[0] as HTMLElement | undefined;
          if (float4) gsap.to(float4, { y: 8, duration: 2.8, ease: "sine.inOut", yoyo: true, repeat: -1, delay: 1.8 });

          // Phone subtle tilt on scroll
          const heroPhone = q("[data-hero-phone]")[0] as HTMLElement | undefined;
          if (heroPhone)
            gsap.to(heroPhone, {
              rotate: 1.5,
              yPercent: -6,
              ease: "none",
              scrollTrigger: { trigger: heroPhone.closest("section"), start: "top top", end: "bottom top", scrub: 1.5 },
            });

          // ---- TRUST STATS ----
          const statCards = q("[data-stat-card]") as HTMLElement[];
          statCards.forEach((card, i) =>
            gsap.from(card, {
              opacity: 0,
              y: 30,
              duration: 0.7,
              ease: "power2.out",
              delay: i * 0.1,
              scrollTrigger: { trigger: card.closest("section"), start: "top 85%", toggleActions: "play none none none" },
            })
          );

          // ---- CAPACIDADES ----
          const capHeader = q("[data-cap-header]")[0] as HTMLElement | undefined;
          if (capHeader)
            gsap.from(capHeader, {
              opacity: 0,
              y: 30,
              duration: 0.9,
              ease: "power2.out",
              scrollTrigger: { trigger: capHeader, start: "top 85%", toggleActions: "play none none none" },
            });

          const capCards = q("[data-cap-card]") as HTMLElement[];
          capCards.forEach((card, i) =>
            gsap.from(card, {
              opacity: 0,
              y: 40,
              scale: 0.95,
              duration: 0.8,
              ease: "power3.out",
              delay: (i % 3) * 0.1,
              scrollTrigger: { trigger: card, start: "top 88%", toggleActions: "play none none none" },
            })
          );

          // ---- PLATAFORMA SPLIT ----
          const platformImg = q("[data-platform-img]")[0] as HTMLElement | undefined;
          if (platformImg)
            gsap.fromTo(
              platformImg,
              { scale: 0.92, opacity: 0, y: 40 },
              { scale: 1.05, opacity: 1, y: 0, duration: 1.4, ease: "power2.out", scrollTrigger: { trigger: platformImg, start: "top 85%", end: "bottom 60%", scrub: 1 } }
            );

          const platformFeatures = q("[data-platform-feature]") as HTMLElement[];
          platformFeatures.forEach((li, i) =>
            gsap.from(li, {
              opacity: 0,
              x: -20,
              duration: 0.5,
              ease: "power2.out",
              delay: i * 0.08,
              scrollTrigger: { trigger: li.closest("ul"), start: "top 85%", toggleActions: "play none none none" },
            })
          );

          // ---- HOW IT WORKS ----
          const howHeader = q("[data-how-header]")[0] as HTMLElement | undefined;
          if (howHeader)
            gsap.from(howHeader, {
              opacity: 0,
              y: 30,
              duration: 0.9,
              ease: "power2.out",
              scrollTrigger: { trigger: howHeader, start: "top 85%", toggleActions: "play none none none" },
            });

          const howSteps = q("[data-how-step]") as HTMLElement[];
          howSteps.forEach((step, i) =>
            gsap.from(step, {
              opacity: 0,
              y: 40,
              scale: 0.9,
              duration: 0.8,
              ease: "back.out(1.4)",
              delay: i * 0.15,
              scrollTrigger: { trigger: step.closest("section"), start: "top 75%", toggleActions: "play none none none" },
            })
          );

          // ---- BENEFITS ----
          const benefitsHeader = q("[data-benefits-header]")[0] as HTMLElement | undefined;
          if (benefitsHeader)
            gsap.from(benefitsHeader, {
              opacity: 0,
              y: 30,
              duration: 0.9,
              ease: "power2.out",
              scrollTrigger: { trigger: benefitsHeader, start: "top 85%", toggleActions: "play none none none" },
            });

          const benefitCards = q("[data-benefit-card]") as HTMLElement[];
          benefitCards.forEach((card) =>
            gsap.from(card, {
              opacity: 0,
              y: 36,
              duration: 0.8,
              ease: "power2.out",
              scrollTrigger: { trigger: card, start: "top 88%", toggleActions: "play none none none" },
            })
          );

          // ---- PRICES ----
          const pricesHeader = q("[data-prices-header]")[0] as HTMLElement | undefined;
          if (pricesHeader)
            gsap.from(pricesHeader, {
              opacity: 0,
              y: 30,
              duration: 0.9,
              ease: "power2.out",
              scrollTrigger: { trigger: pricesHeader, start: "top 85%", toggleActions: "play none none none" },
            });

          const priceCards = q("[data-price-card]") as HTMLElement[];
          priceCards.forEach((card, i) =>
            gsap.from(card, {
              opacity: 0,
              y: 44,
              scale: 0.96,
              duration: 0.9,
              ease: "power3.out",
              delay: i * 0.12,
              scrollTrigger: { trigger: card, start: "top 90%", toggleActions: "play none none none" },
            })
          );

          // ---- NOSOTROS ----
          const nosotrosBlocks = q("[data-nosotros-block]") as HTMLElement[];
          nosotrosBlocks.forEach((block) =>
            gsap.from(block, {
              opacity: 0,
              y: 32,
              duration: 0.9,
              ease: "power2.out",
              scrollTrigger: { trigger: block, start: "top 85%", toggleActions: "play none none none" },
            })
          );

          // ---- CTA BANNER ----
          const ctaBanner = q("[data-cta-banner]")[0] as HTMLElement | undefined;
          if (ctaBanner)
            gsap.from(ctaBanner, {
              opacity: 0,
              y: 40,
              scale: 0.97,
              duration: 1,
              ease: "power3.out",
              scrollTrigger: { trigger: ctaBanner, start: "top 88%", toggleActions: "play none none none" },
            });
        }, rootRef);

        cleanup = () => {
          ctx?.revert();
          ScrollTrigger.getAll().forEach((t) => t.kill());
        };
      } catch {
        // gsap failed to load — page still works without animations
      }
    })();

    return () => {
      cancelled = true;
      cleanup();
    };
  }, [rootRef]);
}
