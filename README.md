# GPTSL for Copilot Chat

VS Code extension that exposes GPTSL AI Gateway models in the VS Code Copilot Chat model picker and shows API key usage in the status bar.

## Features

### Copilot Chat Model Provider

This extension registers GPTSL as a VS Code Language Model Chat provider. After the API key is configured, GPTSL models can appear in Copilot Chat contexts that support third-party language model providers.

Users must configure their own global gateway base URL. Built-in default models are provided without any embedded gateway URL, and each model can define token limits, vision support, API mode, and temperature. The provider supports both OpenAI Responses-style gateway requests and Anthropic messages-style gateway requests.

### Usage Status Bar

The right-side VS Code status bar shows GPTSL usage for the configured API key.

Status bar behavior:

- Shows usage as a percentage by default.
- Can show current spend amount instead.
- Click the status bar item to refresh usage.
- Hover the status bar item to view detailed usage information.

Hover details include:

- Current spend
- Budget limit, when returned by the gateway
- Usage percentage
- Text progress bar
- Display mode
- Key name
- Key alias
- Parsed user name
- Last updated time

The hover also includes quick actions for refreshing usage, opening settings, and toggling the display mode.

### Shared API Key

Chat requests and usage queries use the same API key setting:

- `gptslForCopilotChat.apiKey`

The legacy setting `gptsl.apiKey` is still read as a fallback.

### Settings Command

Use `GPTSL: Open Settings` or the status bar prompt to set the API key and edit model configuration in the native VS Code settings UI.

## Settings

- `gptslForCopilotChat.apiKey`: Bearer token used to call the configured gateway.
- `gptslForCopilotChat.baseUrl`: global gateway base URL used by all models.
- `gptslForCopilotChat.models`: model configuration used by the Copilot Chat provider.
- `gptslForCopilotChat.usageDisplayMode`: status bar usage display mode, either `percentage` or `amount`.

## Commands

- `GPTSL: Open Settings`: open GPTSL settings and prompt for an API key if one is missing.
- `GPTSL: Refresh Usage`: refresh status bar usage information.
- `GPTSL: Toggle Usage Display Mode`: switch the status bar between percentage and amount display.

## Model Configuration

`gptslForCopilotChat.models` is an array of model objects.

Supported fields:

- `id`: model identifier sent to the gateway.
- `apiMode`: request format. Use `openai-responses` or `anthropic`.
- `owned_by`: optional owner label.
- `configId`: optional internal config identifier.
- `context_length`: maximum input context tokens.
- `max_tokens`: maximum output tokens.
- `vision`: whether the model supports image input.
- `temperature`: optional sampling temperature.

Example:

```json
[
  {
    "id": "GPT5.5",
    "context_length": 1000000,
    "max_tokens": 128000,
    "vision": true,
    "apiMode": "openai-responses",
    "temperature": 0
  },
  {
    "id": "claude-sonnet-4-6",
    "context_length": 200000,
    "max_tokens": 40960,
    "vision": true,
    "apiMode": "anthropic"
  }
]
```

## Usage Query

Usage is fetched from `gptslForCopilotChat.baseUrl` plus `/key/info`. If the configured base URL ends with a version suffix such as `/v1`, the usage client removes that version suffix before building the usage URL.

The extension sends the configured API key as both the `key` query parameter and the `api-key` request header, matching the GPTSL usage endpoint behavior.

If the endpoint does not return a global budget, the extension reads model-level budget limits and uses the largest returned budget limit to calculate the status bar percentage.

## Development

```sh
npm install
npm run compile
```

Press `F5` in VS Code to open an Extension Development Host.
