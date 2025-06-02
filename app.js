// Import built-in Node.js modules
const http = require('http');
const https = require('https');
const fs = require('fs');
const url = require('url');
const path = require('path');

// Load environment variables from .env file
const envFile = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
  if (line && !line.startsWith('#')) {
    const [key, value] = line.split('=');
    if (key && value) {
      env[key.trim()] = value.trim();
    }
  }
});

// Set environment variables
process.env.GEMINI_API_KEY = env.GEMINI_API_KEY;
process.env.GEMINI_API_URL = env.GEMINI_API_URL;
process.env.PORT = env.PORT || 3000;

// Validate environment variables
const requiredEnvVars = ['GEMINI_API_KEY', 'GEMINI_API_URL'];
const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);
if (missingEnvVars.length > 0) {
  console.error(`Missing required environment variables: ${missingEnvVars.join(', ')}`);
  console.error('Please create a .env file based on .env.example');
  process.exit(1);
}

// Helper function to make HTTP/HTTPS requests
const makeRequest = (requestUrl, options = {}, data = null) => {
  return new Promise((resolve, reject) => {
    const parsedUrl = url.parse(requestUrl);
    const protocol = parsedUrl.protocol === 'https:' ? https : http;
    
    const requestOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
      path: parsedUrl.path,
      method: options.method || 'GET',
      headers: options.headers || {}
    };

    const req = protocol.request(requestOptions, (res) => {
      let responseData = '';
      
      res.on('data', (chunk) => {
        responseData += chunk;
      });
      
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            // Try to parse as JSON if content-type is application/json
            const contentType = res.headers['content-type'] || '';
            if (contentType.includes('application/json')) {
              resolve({
                data: JSON.parse(responseData),
                status: res.statusCode,
                headers: res.headers
              });
            } else {
              resolve({
                data: responseData,
                status: res.statusCode,
                headers: res.headers
              });
            }
          } catch (error) {
            resolve({
              data: responseData,
              status: res.statusCode,
              headers: res.headers
            });
          }
        } else {
          reject({
            response: {
              status: res.statusCode,
              data: responseData,
              headers: res.headers
            }
          });
        }
      });
    });
    
    req.on('error', (error) => {
      reject({
        request: req,
        message: error.message
      });
    });
    
    if (data) {
      req.write(typeof data === 'string' ? data : JSON.stringify(data));
    }
    
    req.end();
  });
};

// Create HTTP server
const server = http.createServer(async (req, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }
  
  const parsedUrl = url.parse(req.url);
  
  // Handle root path
  if (parsedUrl.pathname === '/' && req.method === 'GET') {
    res.setHeader('Content-Type', 'application/json');
    res.statusCode = 200;
    res.end(JSON.stringify({
      message: 'Welcome to the URL Summarizer API',
      endpoints: {
        summarize: 'POST /summarize with {"url": "https://example.com"}'
      }
    }));
    return;
  }
  
  // Handle summarize endpoint
  if (parsedUrl.pathname === '/summarize' && req.method === 'POST') {
    try {
      // Parse request body
      let body = '';
      req.on('data', chunk => {
        body += chunk.toString();
      });
      
      await new Promise((resolve) => {
        req.on('end', resolve);
      });
      
      let requestData;
      try {
        requestData = JSON.parse(body);
      } catch (error) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Invalid JSON in request body' }));
        return;
      }
      
      const { url: targetUrl } = requestData;
      
      if (!targetUrl) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'URL is required' }));
        return;
      }
      
      // Fetch content from the provided URL
      console.log(`Fetching content from: ${targetUrl}`);
      const response = await makeRequest(targetUrl);
      const content = response.data;
      
      // Extract main content (simplified approach)
      const mainContent = content.toString();
      
      // Send to Gemini API for summarization
      console.log('Sending content to Gemini API for summarization');
      const geminiResponse = await makeRequest(
        process.env.GEMINI_API_URL,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': process.env.GEMINI_API_KEY
          }
        },
        {
          contents: [
            {
              parts: [
                {
                  text: `Summarize the following web page content in one concise sentence:\n\n${mainContent}`
                }
              ]
            }
          ],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 100
          }
        }
      );
      
      // Extract summary from Gemini response
      const summary = geminiResponse.data.candidates[0].content.parts[0].text;
      
      // Return the summary
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        url: targetUrl,
        summary
      }));
      
    } catch (error) {
      console.error('Error:', error.message);
      
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      
      // Handle different types of errors
      if (error.response) {
        console.error('Response error data:', error.response.data);
        res.end(JSON.stringify({
          error: 'Error processing request',
          details: error.response.data
        }));
      } else if (error.request) {
        res.end(JSON.stringify({
          error: 'No response received from server',
          details: error.message
        }));
      } else {
        res.end(JSON.stringify({
          error: 'Error setting up request',
          details: error.message
        }));
      }
    }
    return;
  }
  
  // Handle 404
  res.statusCode = 404;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ error: 'Not found' }));
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Visit http://localhost:${PORT} to get started`);
});
