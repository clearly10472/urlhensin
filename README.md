# Gemini URL Summarizer

A Node.js web service that fetches content from a URL and generates a one-line summary using Google's Gemini API.

## Features

- Accepts a URL via HTTP POST request
- Fetches content from the provided URL
- Uses Google Gemini API to generate a concise one-line summary
- Returns the summary as a JSON response

## Quick Start

```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env file with your Gemini API key

# Start the server
npm start
```

For detailed setup instructions and API usage, see [instructions.md](./instructions.md).

## Tech Stack

- Node.js
- Express.js
- Axios for HTTP requests
- Google Gemini API

## License

MIT
