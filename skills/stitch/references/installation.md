# Stitch Skill: Installation Guide

Complete setup for Gemini CLI + Stitch extension.

## 1. Install Gemini CLI

```bash
# Option A: npm (recommended)
npm install -g @google/gemini-cli

# Option B: Homebrew
brew install gemini-cli

# Option C: Run without installing
npx @google/gemini-cli
```

Verify: `gemini --version`

## 2. Authenticate Gemini CLI

Choose one method:

### Google Login (interactive, free tier)

```bash
gemini   # First run opens browser for login
```

Free tier: 60 req/min, 1,000 req/day.

### API Key (non-interactive, scripting)

```bash
# Get key from https://aistudio.google.com/apikey
export GEMINI_API_KEY="your-key"

# Persist in shell profile or secrets file
echo 'export GEMINI_API_KEY="your-key"' >> ~/.claude-secrets.sh
```

### Vertex AI (enterprise)

```bash
export GOOGLE_GENAI_USE_VERTEXAI=true
export GOOGLE_CLOUD_PROJECT="your-project"
```

## 3. Install Stitch Extension

```bash
gemini extensions install https://github.com/gemini-cli-extensions/stitch --auto-update
```

Verify: `gemini extensions list` should show Stitch.

## 4. Authenticate Stitch

### Method A: API Key (recommended)

1. Go to [stitch.withgoogle.com](https://stitch.withgoogle.com)
2. Click profile icon (top-right) > **Stitch Settings** > **API Keys** > **Create Key**
3. Copy the key and configure:

```bash
export API_KEY="your-stitch-api-key"
sed "s/YOUR_API_KEY/$API_KEY/g" \
  ~/.gemini/extensions/Stitch/gemini-extension-apikey.json \
  > ~/.gemini/extensions/Stitch/gemini-extension.json
```

### Method B: Google Cloud ADC (enterprise)

```bash
# Install gcloud CLI if needed: https://cloud.google.com/sdk/docs/install
gcloud auth login
gcloud config set project YOUR_PROJECT_ID
gcloud beta services mcp enable stitch.googleapis.com --project=YOUR_PROJECT_ID
gcloud auth application-default login
```

## 5. Verify Everything Works

```bash
# Run the skill's check command
path/to/stitch.sh check
```

This verifies:
- Gemini CLI is installed and shows version
- Stitch extension is listed
- Authentication works (lists your Stitch projects)

## Troubleshooting

### "Gemini CLI not found"

Check PATH: `which gemini` or `command -v gemini`.

If installed via volta: ensure `~/.volta/bin/` is on PATH.
If installed via npm: ensure global npm bin is on PATH (`npm config get prefix`).

### "Stitch extension not found"

Re-install: `gemini extensions install https://github.com/gemini-cli-extensions/stitch --auto-update`

Check: `gemini extensions list`

### "Authentication failed" / "Permission denied"

- API Key method: verify the key is valid at stitch.withgoogle.com
- ADC method: run `gcloud auth application-default login` again
- Check the extension config file exists: `ls ~/.gemini/extensions/Stitch/gemini-extension.json`

### Timeout errors

Stitch generation takes 1-2 minutes. Increase timeout:

```bash
export STITCH_TIMEOUT=300  # 5 minutes
```
