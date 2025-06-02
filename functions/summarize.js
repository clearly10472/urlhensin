const https = require('https');
const http = require('http');
const url = require('url');

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

exports.handler = async (event, context) => {
  // Set CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };
  
  // Handle preflight requests
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers,
      body: ''
    };
  }
  
  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }
  
  try {
    // Parse request body
    const requestData = JSON.parse(event.body);
    const { url: targetUrl } = requestData;
    
    if (!targetUrl) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'URL is required' })
      };
    }
    
    // Fetch content from the provided URL
    console.log(`Fetching content from: ${targetUrl}`);
    const response = await makeRequest(targetUrl);
    const content = response.data;
    
    // Extract main content and clean up HTML
    let mainContent = content.toString();
    
    // Remove HTML tags
    mainContent = mainContent.replace(/<[^>]*>/g, ' ');
    
    // Remove extra whitespace
    mainContent = mainContent.replace(/\s+/g, ' ').trim();
    
    // Limit content length to avoid API limits (max 10,000 characters)
    if (mainContent.length > 10000) {
      console.log(`Content truncated from ${mainContent.length} to 10000 characters`);
      mainContent = mainContent.substring(0, 10000) + '...';
    }
    
    // Send to Gemini API for summarization
    console.log('Sending content to Gemini API for summarization');
    const geminiApiKey = process.env.GEMINI_API_KEY;
    // 最新のGoogle AI (Gemini) API URLを使用
    const geminiApiUrl = process.env.GEMINI_API_URL || 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.0-pro:generateContent';
    
    if (!geminiApiKey) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'GEMINI_API_KEY environment variable is not set' })
      };
    }
    
    // より単純なリクエスト形式を使用
    const prompt = `Summarize the following web page content in one concise sentence:\n\n${mainContent}`;
    
    const geminiResponse = await makeRequest(
      `${geminiApiUrl}?key=${geminiApiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      },
      {
        contents: [
          {
            parts: [
              { text: prompt }
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
    return {
      statusCode: 200,
      headers: {
        ...headers,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        url: targetUrl,
        summary
      })
    };
    
  } catch (error) {
    console.error('Error:', error.message);
    console.error('Full error object:', JSON.stringify(error, null, 2));
    
    // Handle different types of errors
    if (error.response) {
      console.error('Response error data:', JSON.stringify(error.response.data, null, 2));
      return {
        statusCode: error.response.status || 500,
        headers,
        body: JSON.stringify({
          error: 'Error processing request',
          details: error.response.data,
          message: error.message,
          stack: error.stack
        })
      };
    } else if (error.request) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          error: 'Error making request',
          details: 'No response received',
          message: error.message,
          stack: error.stack
        })
      };
    } else {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          error: 'Unexpected error',
          message: error.message,
          stack: error.stack
        })
      };
    }
  }
};
