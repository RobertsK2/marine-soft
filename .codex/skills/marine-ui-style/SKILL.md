---
name: marine-ui-style
description: Use when creating or modifying UI components for a maritime/sailing audience. This includes product pages, navigation, hero sections, cards, buttons, forms, and any frontend code targeting sailors, captains, or boat owners. Trigger phrases: "create marine UI", "sailing website", "boat product page", "jūrnieku lapa", "kuģotāju dizains", "add component", "create page", "style this".
---

# Marine UI Component Skill

## When to Use

Whenever you generate HTML, CSS, React, Vue, or any frontend code for the maritime e-commerce platform. This skill overrides default design tendencies and enforces the industrial, functional aesthetic required by the target audience.

## Design System Rules

### Colors (STRICT — no exceptions)
- **Primary (Navy):** `#0A192F` — headers, navigation, primary text, borders
- **Background (Cream):** `#F4F1EA` — page backgrounds, large surfaces
- **Accent (Signal Orange):** `#FF6B35` — CTA buttons ONLY, warnings, active states. Never for decorative elements.
- **Brass:** `#B87333` — details, logo elements, certification stamps, timestamps
- **Secondary (Salt Grey):** `#8A8D91` — secondary surfaces, borders, helper text
- **Pure Black/White:** `#000000` / `#FFFFFF` — contrast, print, technical drawings

### Typography (STRICT)
- **Headings:** DIN, GT America, Söhne, Helvetica Now Display, Akzidenz-Grotesk — Bold (700) or Black (900). Line-height 1.1–1.2.
- **Body:** Inter, Source Sans Pro, Helvetica Now Text, IBM Plex Sans — Regular (400) or Medium (500). 16–18px. Line-height 1.5–1.6. Max 65–75 chars per line.
- **Technical/Coordinates:** JetBrains Mono, SF Mono, IBM Plex Mono, Roboto Mono — Medium (500). 12–14px. Use for dates, coordinates, specs, logbook entries, certification numbers.

### Layout & Spacing
- **Border radius:** MAXIMUM `4px`. Prefer `0px` or `2px`.
- **No glassmorphism.** No transparency effects. No blur backdrops.
- **No gradients.** Especially blue/purple fades.
- **No 3D blobs, organic shapes, or neon effects.**
- **No "Trust badge" layouts** (Hero → Features → Testimonials → CTA). Use asymmetric, tool-like layouts instead.
- **No animated counters** ("10,000+ happy customers!").
- **No "As seen on" media bars.**

### Photography & Imagery
- If photography requard follow these rules.
- Use documentary-style photography only.
- Show real hands working, real rust, real salt, real weather.
- No stock models with sunglasses holding wine glasses.
- No dolphins, sunsets, or "lifestyle" yacht photos.
- Images should feel like National Geographic, not Instagram.

### Tone of Voice
- Direct, factual, numbers-driven.
- Replace marketing fluff with specifications.
- BAD: "Revolutionary design for the modern sailor"
- GOOD: "Tested to 35-knot load. Rated for Beaufort 8."
- BAD: "Experience freedom on the open sea"
- GOOD: "GPS: 56°57′N 24°06′E. Let's go."

## Component-Specific Rules

### Buttons
- Primary CTA: Signal orange background (`#FF6B35`), cream or navy text, `border-radius: 2px`, uppercase or small-caps, bold weight.
- Secondary: Navy border (`1px solid #0A192F`), transparent background, navy text.
- Disabled: Salt grey (`#8A8D91`), no opacity tricks.

### Navigation
- Fixed top bar, solid navy (`#0A192F`) or cream (`#F4F1EA`) background.
- Font: heading font, 14px, uppercase, weight 500.
- Active state: Signal orange underline or background.
- No shadows, no transparency.

### Product Cards
- Must include: product name, technical specs (numbers), price, certification badges.
- Optional: coordinates or logbook-style test entry ("Tested: 14.03.2026. Wind: 18kn. Waves: 2m.")
- No hover lift animations. No shadow spreads. Use `border: 1px solid #8A8D91` for separation.

### Forms
- Labels: heading font, 12px, uppercase, salt grey.
- Inputs: `border: 1px solid #8A8D91`, `border-radius: 2px`, cream background.
- Focus state: `border-color: #0A192F` or `outline: 2px solid #FF6B35`.
- No floating labels. No animated placeholders.

### Hero Sections
- Large heading (48–96px), heading font, bold.
- Subheading with technical detail or coordinates.
- Background: documentary photo with dark overlay (navy at 40–60% opacity) OR solid cream.
- CTA: Signal orange, clearly visible.
- No gradient overlays on photos.

## Verification Checklist

Before finalizing any component, confirm:
1. [ ] No gradients used anywhere.
2. [ ] No border-radius exceeds 4px.
3. [ ] All text uses approved font families.
4. [ ] CTA color is signal orange and used sparingly.
5. [ ] Technical specs or coordinates appear where relevant.
6. [ ] Tone is factual, not marketing-fluffy.
7. [ ] Photography direction matches documentary style.
8. [ ] Component would not look out of place on a ship's instrument panel.

## Example Triggers
- "Create a product page for a marine anchor"
- "Style this navigation bar for sailors"
- "Build a hero section for a boat equipment shop"
- "Add a checkout form"
- "Create a card component for fishing gear"
