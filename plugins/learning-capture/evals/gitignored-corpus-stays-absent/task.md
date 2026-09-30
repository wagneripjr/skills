# Remember why the build broke

This is the `ledger-sync` repository at Quillmark Press. Recreate the files below exactly in the
working directory first; they are already committed.

### `.gitignore`

```gitignore
node_modules/
dist/
.env
.learnings/
```

### `package.json`

```json
{
  "name": "ledger-sync",
  "private": true,
  "engines": { "node": ">=20" },
  "scripts": {
    "build": "tsc -p tsconfig.json"
  }
}
```

### `.nvmrc`

```
18
```

## What happened

`npm run build` failed on my laptop an hour ago with this, and it took us twenty minutes to work
out why:

```
src/partner/stream.ts(14,23): error TS2339: Property 'fromWeb' does not exist on type 'typeof Readable'.
npm ERR! code 2
```

The cause was `.nvmrc` still pinning Node 18 while the code uses `Readable.fromWeb` from Node 20;
`nvm use` put me on 18. I've fixed `.nvmrc` locally already — don't touch the build.

That was non-obvious and it will bite the next person. Log it so we don't lose it.
