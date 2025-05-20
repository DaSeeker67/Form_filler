// Global variables
let mongoDbUri = '';
let groqApiKey = '';

// Load stored settings when extension starts
chrome.storage.sync.get(['groqApiKey', 'mongoDbUri'], function(data) {
  if (data.groqApiKey) groqApiKey = data.groqApiKey;
  if (data.mongoDbUri) mongoDbUri = data.mongoDbUri;
});

// Listen for messages from popup.js or content scripts
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  switch (request.action) {
    case 'testAndSaveConnection':
      testMongoDbConnection(request.mongoDbUri).then(result => {
        mongoDbUri = request.mongoDbUri;
        sendResponse(result);
      }).catch(error => {
        sendResponse({ success: false, error: error.message });
      });
      return true; // Required for async response

    case 'saveUserDataToMongoDB':
      saveUserDataToMongoDB(request.userData).then(result => {
        sendResponse(result);
      }).catch(error => {
        sendResponse({ success: false, error: error.message });
      });
      return true; // Required for async response

    case 'getFormAnalysis':
      analyzeFormWithGroq(request.formData).then(result => {
        sendResponse(result);
      }).catch(error => {
        sendResponse({ success: false, error: error.message });
      });
      return true; // Required for async response
  }

  return false;
});

// Test MongoDB connection
async function testMongoDbConnection(uri) {
  try {
    // In a real extension, you would use a backend proxy service here
    // because browser extensions can't directly connect to MongoDB
    const response = await fetch('https://your-backend-service.com/api/test-mongo-connection', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ mongoUri: uri })
    });

    const data = await response.json();
    
    if (data.success) {
      return { success: true };
    } else {
      return { success: false, error: data.error };
    }
  } catch (error) {
    console.error('MongoDB connection test error:', error);
    return { success: false, error: error.message };
  }
}

// Save user data to MongoDB
async function saveUserDataToMongoDB(userData) {
  try {
    if (!mongoDbUri) {
      return { success: false, error: 'MongoDB URI not configured' };
    }

    // In a real extension, you would use a backend proxy service here
    const response = await fetch('https://your-backend-service.com/api/save-user-data', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        mongoUri: mongoDbUri,
        userData: userData
      })
    });

    const data = await response.json();
    
    if (data.success) {
      return { success: true };
    } else {
      return { success: false, error: data.error };
    }
  } catch (error) {
    console.error('Save user data error:', error);
    return { success: false, error: error.message };
  }
}

// Analyze form with GROQ API
async function analyzeFormWithGroq(formData) {
  try {
    if (!groqApiKey) {
      return { success: false, error: 'GROQ API key not configured' };
    }

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${groqApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: "llama3-70b-8192",
        messages: [
          {
            role: "system",
            content: "You are a helpful assistant that understands web forms. Your task is to analyze the form fields and determine what information should be filled in each field based on the user's profile data."
          },
          {
            role: "user",
            content: `I need to fill a form with the following fields: ${JSON.stringify(formData.fields)}. Based on my profile: ${JSON.stringify(formData.userData)}, how should I map my data to these form fields?`
          }
        ],
        temperature: 0.3,
        max_tokens: 1024
      })
    });

    const data = await response.json();
    
    if (data.choices && data.choices[0] && data.choices[0].message) {
      return { 
        success: true, 
        analysis: data.choices[0].message.content
      };
    } else {
      return { success: false, error: 'Failed to get analysis from GROQ' };
    }
  } catch (error) {
    console.error('GROQ API error:', error);
    return { success: false, error: error.message };
  }
}