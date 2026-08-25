# Third-Party Notices

This repository is MIT licensed (see [LICENSE](LICENSE)). It also ships one prebuilt artifact that
embeds third-party code, and loads two libraries from a CDN at runtime. Their notices follow.

## Bundled into `doc-this/skills/doc-this-viewer/assets/dist/`

`doc-this-viewer` ships a prebuilt static SPA so the skill needs no `npm install` at runtime. The
compiled bundle contains code from the projects below. Both are MIT licensed, and both license
texts are reproduced in full.

| Project | Version | License | Source |
|---|---|---|---|
| Svelte | 5.56.10 | MIT | https://github.com/sveltejs/svelte |
| marked | 15.0.12 | MIT | https://github.com/markedjs/marked |

### Svelte

```
Copyright (c) 2016-present, Svelte contributors
(https://github.com/sveltejs/svelte/graphs/contributors)

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and
associated documentation files (the "Software"), to deal in the Software without restriction,
including without limitation the rights to use, copy, modify, merge, publish, distribute,
sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or
substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT
NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT
OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
```

### marked

```
Copyright (c) 2018+, MarkedJS (https://github.com/markedjs/)
Copyright (c) 2011-2018, Christopher Jeffrey (https://github.com/chjj/)

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and
associated documentation files (the "Software"), to deal in the Software without restriction,
including without limitation the rights to use, copy, modify, merge, publish, distribute,
sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or
substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT
NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT
OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
```

## Loaded at runtime from a CDN (not bundled)

The viewer fetches these from `cdn.jsdelivr.net` in the browser only when a document contains a
diagram; they are not redistributed here, and diagrams degrade to a code block if the fetch fails.

| Project | License | Source |
|---|---|---|
| Mermaid | MIT | https://github.com/mermaid-js/mermaid |
| `@mermaid-js/layout-elk` | MIT | https://github.com/mermaid-js/mermaid |

## Rebuilding the bundle

`doc-this/skills/doc-this-viewer/scripts/build.mjs` regenerates `assets/dist/`. When it pulls in a
new or changed dependency, update the table above and reproduce the new license text.
