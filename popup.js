document.addEventListener('DOMContentLoaded', function() {
  // Get DOM elements
  const settingsTab = document.getElementById('settings-tab');
  const profileTab = document.getElementById('profile-tab');
  const settingsPanel = document.getElementById('settings-panel');
  const profilePanel = document.getElementById('profile-panel');
  const saveSettingsBtn = document.getElementById('save-settings');
  const saveProfileBtn = document.getElementById('save-profile');
  const injectButton = document.getElementById('inject-button');
  const statusElement = document.getElementById('status');
  const profileStatusElement = document.getElementById('profile-status');

  // Tab switching logic
  settingsTab.addEventListener('click', function() {
    settingsTab.classList.add('active');
    profileTab.classList.remove('active');
    settingsPanel.classList.remove('hidden');
    profilePanel.classList.add('hidden');
  });

  profileTab.addEventListener('click', function() {
    profileTab.classList.add('active');
    settingsTab.classList.remove('active');
    profilePanel.classList.remove('hidden');
    settingsPanel.classList.add('hidden');
  });

  // Load saved settings
  chrome.storage.sync.get(['groqApiKey', 'mongoDbUri'], function(data) {
    if (data.groqApiKey) {
      document.getElementById('groq-api-key').value = data.groqApiKey;
    }
    if (data.mongoDbUri) {
      document.getElementById('mongodb-uri').value = data.mongoDbUri;
    }
  });

  // Load saved profile data
  chrome.storage.sync.get(['userData'], function(data) {
    if (data.userData) {
      document.getElementById('full-name').value = data.userData.fullName || '';
      document.getElementById('email').value = data.userData.email || '';
      document.getElementById('phone').value = data.userData.phone || '';
      document.getElementById('address').value = data.userData.address || '';
      document.getElementById('professional-background').value = data.userData.professionalBackground || '';
      document.getElementById('skills').value = data.userData.skills || '';
    }
  });

  // Save settings
  saveSettingsBtn.addEventListener('click', function() {
    const groqApiKey = document.getElementById('groq-api-key').value;
    const mongoDbUri = document.getElementById('mongodb-uri').value;
    
    if (!groqApiKey || !mongoDbUri) {
      showStatus(statusElement, 'Please fill in all settings fields', false);
      return;
    }
    
    chrome.storage.sync.set({
      groqApiKey: groqApiKey,
      mongoDbUri: mongoDbUri
    }, function() {
      showStatus(statusElement, 'Settings saved successfully!', true);
      
      // Send to background for MongoDB connection test and sync
      chrome.runtime.sendMessage({
        action: 'testAndSaveConnection',
        mongoDbUri: mongoDbUri
      }, function(response) {
        if (response && response.success) {
          showStatus(statusElement, 'MongoDB connection successful!', true);
        } else {
          showStatus(statusElement, 'MongoDB connection failed: ' + (response ? response.error : 'Unknown error'), false);
        }
      });
    });
  });

  // Save profile data
  saveProfileBtn.addEventListener('click', function() {
    const userData = {
      fullName: document.getElementById('full-name').value,
      email: document.getElementById('email').value,
      phone: document.getElementById('phone').value,
      address: document.getElementById('address').value,
      professionalBackground: document.getElementById('professional-background').value,
      skills: document.getElementById('skills').value
    };
    
    chrome.storage.sync.set({ userData: userData }, function() {
      showStatus(profileStatusElement, 'Profile saved successfully!', true);
      
      // Send to background for MongoDB sync
      chrome.runtime.sendMessage({
        action: 'saveUserDataToMongoDB',
        userData: userData
      }, function(response) {
        if (response && response.success) {
          showStatus(profileStatusElement, 'Profile synced with MongoDB!', true);
        } else {
          showStatus(profileStatusElement, 'Failed to sync with MongoDB: ' + (response ? response.error : 'Unknown error'), false);
        }
      });
    });
  });

  // Inject data into form
  injectButton.addEventListener('click', function() {
    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'analyzeAndFillForm' }, function(response) {
          if (response && response.success) {
            showStatus(profileStatusElement, 'Form analysis initiated!', true);
          } else {
            showStatus(profileStatusElement, 'Error analyzing form: ' + (response ? response.error : 'Unknown error'), false);
          }
        });
      }
    });
  });

  // Helper function to show status messages
  function showStatus(element, message, isSuccess) {
    element.textContent = message;
    element.classList.remove('hidden', 'success', 'error');
    element.classList.add(isSuccess ? 'success' : 'error');
    
    setTimeout(function() {
      element.classList.add('hidden');
    }, 3000);
  }
});