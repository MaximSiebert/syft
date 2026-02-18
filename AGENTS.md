# AGENTS.md

## Project Overview

This is a vanilla JavaScript single-page application built with Vite, Tailwind CSS, and Supabase. It provides a list management system where users can create, manage, and share lists of items (books, music, products, etc.).

## Commands

### Development
```bash
npm run dev
```
Starts the Vite development server on port 5173 (accessible at `http://localhost:5173`).

### Build
```bash
npm run build
```
Creates a production build in the `dist/` directory.

### Preview
```bash
npm run preview
```
Previews the production build locally.

### Testing & Linting
**No tests or linting are currently configured** for this project. Do not add testing frameworks without explicit user request.

## Code Style Guidelines

### Language & Modules
- Use **vanilla JavaScript** (no TypeScript, no frameworks)
- Use **ES Modules** with explicit `.js` extensions in all imports
- Example: `import { foo } from './lib/db.js'` (not `./lib/db`)

### File Organization
```
src/
├── lib/       # Data layer (db.js, auth.js, supabase.js, cache.js)
├── pages/     # Page logic (login.js, profile.js, list.js, etc.)
├── utils/     # Shared utilities (ui.js, nav.js, guards.js, scroll.js)
├── components/ # Reusable UI components (add-item-form.js)
└── styles/    # CSS files
```

### Naming Conventions
- **Files**: kebab-case (e.g., `add-item-form.js`, `list-items.js`)
- **Functions/variables**: camelCase (e.g., `getList`, `currentListId`)
- **Constants**: camelCase with descriptive names (e.g., `PAGE_SIZE`)
- **DOM elements**: Use descriptive IDs and data attributes

### Imports
Group imports in this order:
1. External libraries (e.g., `sortablejs`)
2. Internal modules from `src/lib/`
3. Internal modules from `src/pages/`
4. Internal modules from `src/utils/`
5. Internal modules from `src/components/`

```javascript
import Sortable from 'sortablejs'
import { getList, getListItems } from '../lib/db.js'
import { getSession } from '../lib/auth.js'
import { showToast } from '../utils/ui.js'
import { initAddItemForm } from '../components/add-item-form.js'
```

### Error Handling
- Throw Supabase errors directly: `if (error) throw error`
- Wrap async operations in try/catch blocks
- Show user-friendly errors via `showToast(error.message, 'error')`
- Redirect on auth failures: `window.location.href = '/'`

```javascript
try {
  const data = await someOperation()
  // handle success
} catch (error) {
  showToast(error.message, 'error')
}
```

### HTML Templates
Use template literals for generating HTML. Always escape user content:

```javascript
function escapeHtml(text) {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

// Usage in template:
`<h3 class="item-title">${escapeHtml(item.title)}</h3>`
```

### CSS & Styling
- Use **Tailwind CSS** for all styling (v4 with `@tailwindcss/vite`)
- Apply classes directly in HTML templates or template literals
- Use responsive prefixes: `sm:`, `md:`, `lg:`, `xl:`
- Use arbitrary values sparingly: `leading-[24px]`, `text-pretty`

### Environment Variables
- All env vars must be prefixed with `VITE_` to be available in client code
- Required variables:
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`
- Access via: `import.meta.env.VITE_SUPABASE_URL`
- Never log or expose secret keys

### Authentication
- Use Supabase auth helpers from `src/lib/auth.js`
- Common patterns:
  ```javascript
  import { getSession, getCurrentUser, onAuthStateChange } from '../lib/auth.js'
  ```
- Check auth state before protected operations
- Use `getSessionUserIdSync()` for synchronous auth checks when needed

### Supabase Patterns
- Use the `supabase` client from `src/lib/supabase.js`
- Always handle errors from Supabase responses
- Use `.single()` for expected single rows
- Use `.select()` with explicit columns for better performance

```javascript
const { data, error } = await supabase
  .from('lists')
  .select('id, name, slug')
  .eq('user_id', userId)
  .single()

if (error) throw error
return data
```

### Caching
- Use the `src/lib/cache.js` module for client-side caching
- Pattern: `getCached(key)`, `setCache(key, data)`, `clearCache(key)`
- Cache keys should be descriptive: `'list:' + slug`

### DOM Manipulation
- Use `document.getElementById()` and `document.querySelector()`
- Use event delegation for dynamic elements
- Use `insertAdjacentHTML` for inserting HTML fragments

### Guards & Protection
- Use `src/utils/guards.js` for route protection
- Pattern: redirect unauthenticated users to login page

## Security

- Never commit secrets, API keys, or credentials
- Keep `.env` in `.gitignore`
- Use `.env.example` for required environment variables
- Escape all user-generated content before rendering HTML
- Use `rel="noopener"` for external links

## Additional Notes

- Multi-page app with entry points: `index.html`, `login.html`, `profile.html`, `list.html`, `settings.html`
- No build-step for CSS (Tailwind is processed at build time via Vite plugin)
- SortableJS used for drag-and-drop reordering
- Use `async/await` over Promise chains for readability
