# GEMINI.md Template for Stitch Projects

Copy this template to your project's `GEMINI.md` file and fill in the values. Gemini CLI reads this file automatically, giving Stitch context about your design system.

The `stitch.sh link` command appends a basic version of this section. Enrich it for better design consistency.

---

```markdown
## Stitch Design System

- Stitch Project ID: {numeric-project-id}
- Project: {project-name}
- Use Stitch tools to manage screens in this project
- Match the existing design system when generating new screens

### Brand Colors
- Primary: {#hex}
- Secondary: {#hex}
- Accent: {#hex}
- Background: {#hex}
- Surface: {#hex}
- Text: {#hex}
- Text Secondary: {#hex}

### Typography
- Heading font: {font family}
- Body font: {font family}
- Monospace font: {font family}

### Style Direction
- {describe the visual style: minimal, bold, playful, corporate, etc.}
- {describe key UI patterns: card-based, sidebar nav, bottom tabs, etc.}
- {describe any constraints: must be accessible, RTL support, dark mode required, etc.}

### Component Patterns
- Buttons: {rounded, pill, square edges}
- Cards: {shadow, border, flat}
- Navigation: {top bar, sidebar, bottom tabs}
- Forms: {floating labels, outlined inputs, filled inputs}
```
