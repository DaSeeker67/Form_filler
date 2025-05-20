// Listen for messages from popup or background script
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.action === "analyzeAndFillForm") {
    analyzeAndFillForm()
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // Required for async response
  }
  return false;
});

// Main function to analyze and fill the form
async function analyzeAndFillForm() {
  try {
    // Step 1: Show loading indicator
    showLoadingOverlay();
    
    // Step 2: Extract form fields
    const formFields = extractFormFields();
    
    if (formFields.length === 0) {
      hideLoadingOverlay();
      return { success: false, error: "No form fields detected on this page" };
    }
    
    // Step 3: Get user data from storage
    const userData = await getUserData();
    
    if (!userData) {
      hideLoadingOverlay();
      return { success: false, error: "No user data found. Please add your profile information first." };
    }
    
    // Step 4: Get form field analysis from GROQ via background script
    const analysis = await getFormAnalysis(formFields, userData);
    
    if (!analysis.success) {
      hideLoadingOverlay();
      return { success: false, error: analysis.error };
    }
    
    // Step 5: Parse the GROQ response
    const fieldMappings = parseGroqResponse(analysis.analysis);
    
    // Step 6: Fill the form with the user data based on the mappings
    fillForm(fieldMappings, userData);
    
    // Step 7: Hide loading indicator
    hideLoadingOverlay();
    
    return { success: true };
  } catch (error) {
    hideLoadingOverlay();
    console.error("Form filling error:", error);
    return { success: false, error: error.message };
  }
}

// Extract form fields from the current page
function extractFormFields() {
  const formFields = [];
  
  // Find all input, select, and textarea elements
  const inputElements = document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]), select, textarea');
  
  inputElements.forEach(element => {
    // Get field information
    const fieldInfo = {
      type: element.tagName.toLowerCase() === 'input' ? element.type : element.tagName.toLowerCase(),
      id: element.id || '',
      name: element.name || '',
      placeholder: element.placeholder || '',
      label: getFieldLabel(element),
      value: element.value || '',
      element: element // Store reference to the actual element
    };
    
    // Only add fields that have some form of identification
    if (fieldInfo.id || fieldInfo.name || fieldInfo.placeholder || fieldInfo.label) {
      formFields.push(fieldInfo);
    }
  });
  
  return formFields;
}

// Get the label text for a form field
function getFieldLabel(element) {
  // Try to find label by for attribute
  if (element.id) {
    const label = document.querySelector(`label[for="${element.id}"]`);
    if (label && label.textContent) {
      return label.textContent.trim();
    }
  }
  
  // Try to find label as parent or ancestor
  let parent = element.parentElement;
  while (parent && parent.tagName !== 'FORM') {
    // Check if the parent contains a label
    const labels = parent.querySelectorAll('label');
    for (const label of labels) {
      if (label.textContent && !label.getAttribute('for')) {
        return label.textContent.trim();
      }
    }
    
    // Check for any text nodes in the parent that might be a label
    for (const node of parent.childNodes) {
      if (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) {
        return node.textContent.trim();
      }
    }
    
    // Move up the DOM
    parent = parent.parentElement;
  }
  
  return '';
}

// Get user data from Chrome storage
async function getUserData() {
  return new Promise(resolve => {
    chrome.storage.sync.get(['userData'], function(data) {
      resolve(data.userData || null);
    });
  });
}

// Get form field analysis from GROQ API via background script
async function getFormAnalysis(formFields, userData) {
  return new Promise(resolve => {
    chrome.runtime.sendMessage({
      action: 'getFormAnalysis',
      formData: {
        fields: formFields.map(field => ({
          type: field.type,
          id: field.id,
          name: field.name,
          placeholder: field.placeholder,
          label: field.label,
          value: field.value
        })),
        userData: userData
      }
    }, response => {
      resolve(response);
    });
  });
}

// Parse the GROQ response to get field mappings
function parseGroqResponse(analysisText) {
  const mappings = {};
  
  try {
    // Try to extract JSON if the response contains it
    const jsonMatch = analysisText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const jsonStr = jsonMatch[0];
      try {
        return JSON.parse(jsonStr);
      } catch (e) {
        console.log("Could not parse JSON directly, trying alternative parsing");
      }
    }
    
    // Alternative parsing for different response formats
    // Look for field mappings in the format "fieldName/id/label: value"
    const lines = analysisText.split('\n');
    for (const line of lines) {
      // Look for patterns like "field: value" or "field -> value"
      const mapping = line.match(/([^:]+):\s*(.+)/) || line.match(/([^->]+)->\s*(.+)/);
      if (mapping) {
        const fieldIdentifier = mapping[1].trim().toLowerCase();
        const value = mapping[2].trim();
        mappings[fieldIdentifier] = value;
      }
    }
    
    return mappings;
  } catch (error) {
    console.error("Error parsing GROQ response:", error);
    return {};
  }
}

// Fill the form with user data based on mappings
function fillForm(fieldMappings, userData) {
  const formFields = extractFormFields();
  
  // For each field, find the appropriate value and fill it
  formFields.forEach(field => {
    let valueToFill = null;
    
    // Check for direct matches by id, name, or label
    const idLower = field.id.toLowerCase();
    const nameLower = field.name.toLowerCase();
    const labelLower = field.label.toLowerCase();
    const placeholderLower = field.placeholder.toLowerCase();
    
    // Use the field mappings from GROQ first
    if (fieldMappings[idLower]) {
      valueToFill = fieldMappings[idLower];
    } else if (fieldMappings[nameLower]) {
      valueToFill = fieldMappings[nameLower];
    } else if (fieldMappings[labelLower]) {
      valueToFill = fieldMappings[labelLower];
    } else if (fieldMappings[placeholderLower]) {
      valueToFill = fieldMappings[placeholderLower];
    } else {
      // Fallback to direct field matching
      if (containsAny(idLower, ["name", "fullname"])) {
        valueToFill = userData.fullName;
      } else if (containsAny(idLower, ["email", "mail"])) {
        valueToFill = userData.email;
      } else if (containsAny(idLower, ["phone", "tel", "mobile"])) {
        valueToFill = userData.phone;
      } else if (containsAny(idLower, ["address", "location"])) {
        valueToFill = userData.address;
      } else if (containsAny(idLower, ["background", "experience", "about"])) {
        valueToFill = userData.professionalBackground;
      } else if (containsAny(idLower, ["skill", "expertise"])) {
        valueToFill = userData.skills;
      }
      
      // Try with name if id didn't match
      if (!valueToFill) {
        if (containsAny(nameLower, ["name", "fullname"])) {
          valueToFill = userData.fullName;
        } else if (containsAny(nameLower, ["email", "mail"])) {
          valueToFill = userData.email;
        } else if (containsAny(nameLower, ["phone", "tel", "mobile"])) {
          valueToFill = userData.phone;
        } else if (containsAny(nameLower, ["address", "location"])) {
          valueToFill = userData.address;
        } else if (containsAny(nameLower, ["background", "experience", "about"])) {
          valueToFill = userData.professionalBackground;
        } else if (containsAny(nameLower, ["skill", "expertise"])) {
          valueToFill = userData.skills;
        }
      }
      
      // Try with label if id and name didn't match
      if (!valueToFill) {
        if (containsAny(labelLower, ["name", "fullname"])) {
          valueToFill = userData.fullName;
        } else if (containsAny(labelLower, ["email", "mail"])) {
          valueToFill = userData.email;
        } else if (containsAny(labelLower, ["phone", "tel", "mobile"])) {
          valueToFill = userData.phone;
        } else if (containsAny(labelLower, ["address", "location"])) {
          valueToFill = userData.address;
        } else if (containsAny(labelLower, ["background", "experience", "about"])) {
          valueToFill = userData.professionalBackground;
        } else if (containsAny(labelLower, ["skill", "expertise"])) {
          valueToFill = userData.skills;
        }
      }
      
      // Try with placeholder as a last resort
      if (!valueToFill) {
        if (containsAny(placeholderLower, ["name", "fullname"])) {
          valueToFill = userData.fullName;
        } else if (containsAny(placeholderLower, ["email", "mail"])) {
          valueToFill = userData.email;
        } else if (containsAny(placeholderLower, ["phone", "tel", "mobile"])) {
          valueToFill = userData.phone;
        } else if (containsAny(placeholderLower, ["address", "location"])) {
          valueToFill = userData.address;
        } else if (containsAny(placeholderLower, ["background", "experience", "about"])) {
          valueToFill = userData.professionalBackground;
        } else if (containsAny(placeholderLower, ["skill", "expertise"])) {
          valueToFill = userData.skills;
        }
      }
    }
    
    // Fill the field with the value if found
    if (valueToFill) {
      fillFieldWithValue(field.element, valueToFill);
    }
  });
}

// Check if a string contains any of the keywords
function containsAny(str, keywords) {
  return keywords.some(keyword => str.includes(keyword));
}

// Fill a field with the given value
function fillFieldWithValue(element, value) {
  // Set the value and dispatch events to trigger any listeners
  const tagName = element.tagName.toLowerCase();
  const type = element.type ? element.type.toLowerCase() : '';
  
  if (tagName === 'select') {
    // For select elements, find the option with matching text or value
    const options = Array.from(element.options);
    const matchingOption = options.find(option => 
      option.text.toLowerCase().includes(value.toLowerCase()) || 
      option.value.toLowerCase().includes(value.toLowerCase())
    );
    
    if (matchingOption) {
      element.value = matchingOption.value;
    }
  } else if (type === 'checkbox' || type === 'radio') {
    // For checkboxes and radio buttons, check based on value or label
    const valueL = value.toLowerCase();
    if (valueL === 'yes' || valueL === 'true' || valueL === '1' || valueL === 'on') {
      element.checked = true;
    } else {
      element.checked = false;
    }
  } else {
    // For text inputs and textareas
    element.value = value;
  }
  
  // Dispatch events
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
  element.dispatchEvent(new Event('blur', { bubbles: true }));
}

// Show loading overlay
function showLoadingOverlay() {
  const overlay = document.createElement('div');
  overlay.id = 'groq-form-filler-overlay';
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background-color: rgba(0, 0, 0, 0.5);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 10000;
  `;
  
  const spinner = document.createElement('div');
  spinner.style.cssText = `
    width: 50px;
    height: 50px;
    border: 5px solid #f3f3f3;
    border-top: 5px solid #3498db;
    border-radius: 50%;
    animation: spin 1s linear infinite;
  `;
  
  const styleElement = document.createElement('style');
  styleElement.textContent = `
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
  `;
  
  document.head.appendChild(styleElement);
  overlay.appendChild(spinner);
  document.body.appendChild(overlay);
}

// Hide loading overlay
function hideLoadingOverlay() {
  const overlay = document.getElementById('groq-form-filler-overlay');
  if (overlay) {
    overlay.remove();
  }
}