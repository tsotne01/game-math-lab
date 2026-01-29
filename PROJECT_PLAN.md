# Game Math Lab - Project Plan

## 🎯 Vision
An interactive, polished learning platform for game development algorithms and math. Learn by building real games with live code playgrounds.

---

## 🛠️ Tech Stack Decision

### Framework: **Astro + React**
- Astro for fast static site generation & content
- React "islands" for interactive components
- Best of both worlds: fast pages + dynamic demos

### Styling: **Tailwind CSS + shadcn/ui**
- Consistent design system
- Dark theme optimized for developers
- Accessible components out of the box

### Content: **MDX**
- Write lessons in Markdown
- Embed React components directly
- Code blocks with syntax highlighting

### Interactive Code: **Sandpack**
- By CodeSandbox team (widely used, battle-tested)
- Live code editing with preview
- Perfect for "try it yourself" sections

### Canvas/Game Demos: **Custom React + Canvas**
- Keep it vanilla for learning purposes
- Students see the actual math, no magic

### Animations: **Framer Motion**
- Smooth page transitions
- Animated visualizations
- Interactive diagrams

### Syntax Highlighting: **Shiki**
- GitHub-style highlighting
- Works great with Astro

### Progress Tracking: **localStorage + optional Supabase**
- Start simple (localStorage)
- Add accounts later if needed

---

## 📁 New Project Structure

```
game-math-lab/
├── astro.config.mjs
├── package.json
├── tailwind.config.mjs
├── tsconfig.json
├── public/
│   ├── fonts/
│   └── images/
├── src/
│   ├── components/
│   │   ├── ui/              # shadcn components
│   │   ├── lessons/         # Lesson-specific components
│   │   │   ├── CodePlayground.tsx
│   │   │   ├── CanvasDemo.tsx
│   │   │   ├── InteractiveGraph.tsx
│   │   │   └── Quiz.tsx
│   │   ├── layout/
│   │   │   ├── Header.tsx
│   │   │   ├── Sidebar.tsx
│   │   │   └── Footer.tsx
│   │   └── modules/         # Module-specific game demos
│   │       ├── Pong.tsx
│   │       ├── Asteroids.tsx
│   │       └── ...
│   ├── content/
│   │   └── modules/         # MDX lesson content
│   │       ├── 01-vectors/
│   │       │   ├── 01-intro.mdx
│   │       │   ├── 02-operations.mdx
│   │       │   ├── 03-dot-product.mdx
│   │       │   └── 04-project.mdx
│   │       ├── 02-trigonometry/
│   │       └── ...
│   ├── layouts/
│   │   ├── BaseLayout.astro
│   │   └── ModuleLayout.astro
│   ├── pages/
│   │   ├── index.astro
│   │   ├── modules/
│   │   └── sandbox.astro
│   ├── styles/
│   │   └── globals.css
│   └── lib/
│       ├── progress.ts
│       └── utils.ts
└── README.md
```

---

## 🎨 Design Direction

### Theme: **"Arcade Terminal"**
- Dark background (#0a0a0f base)
- Neon accent colors (purple #6c5ce7, cyan #00cec9, pink #fd79a8)
- Monospace fonts for code
- CRT/retro touches (subtle scanlines, glow effects)
- Clean, readable content areas

### Key UI Elements:
- Progress bar with XP/level metaphor
- Achievement badges for completing modules
- Interactive formula cards
- Animated code execution visualization
- Split view: theory left, demo right

---

## 📋 Task Breakdown

### Phase 1: Foundation (Day 1-2)
- [ ] Initialize Astro project with React, Tailwind, MDX
- [ ] Set up shadcn/ui components
- [ ] Create base layouts (header, sidebar, footer)
- [ ] Design and implement home page
- [ ] Set up Sandpack integration
- [ ] Configure Netlify auto-deploy from GitHub

### Phase 2: Module System (Day 2-3)
- [ ] Create module layout with progress tracking
- [ ] Build CodePlayground component
- [ ] Build CanvasDemo component (for game demos)
- [ ] Build Quiz component
- [ ] Implement local progress storage

### Phase 3: Content - Module 01 (Day 3-4)
- [ ] Write MDX lessons for Vectors module
- [ ] Create interactive vector visualizer
- [ ] Port Pong game to React component
- [ ] Add challenges and quiz

### Phase 4: Polish (Day 4-5)
- [ ] Add animations (Framer Motion)
- [ ] Mobile responsive refinements
- [ ] Performance optimization
- [ ] SEO meta tags
- [ ] Social preview images

### Phase 5: Content Expansion (Ongoing)
- [ ] Module 02: Trigonometry
- [ ] Module 03: Physics
- [ ] ... (continue through all 13 modules)

---

## 🔄 Automation (Cron Jobs)

1. **Daily Progress Check** - Track what's done, what's next
2. **Weekly Module Reminder** - Nudge Tsotne to continue learning
3. **Deploy Check** - Verify site is live and healthy

---

## 📊 Success Metrics

- All 13 modules complete with interactive demos
- < 2s page load time
- Mobile-friendly (works on phone)
- 100% Lighthouse accessibility score
- Tsotne completes at least 3 modules

---

*Created: 2026-01-29*
