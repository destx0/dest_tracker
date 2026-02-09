# Testing Guide - Productive Sites Feature

## Setup

1. Build the extension:
   ```bash
   pnpm build
   ```

2. Load the extension in your browser:
   - Chrome: Go to `chrome://extensions/`, enable Developer mode, click "Load unpacked", select the `dist` folder
   - Firefox: Go to `about:debugging#/runtime/this-firefox`, click "Load Temporary Add-on", select any file in the `dist` folder

## Test Case 1: Productive Site with Time Limit

### Steps:
1. Open the extension popup
2. Go to Settings → Productive tab
3. Verify that `leetcode.com` is in the list (or add it)
4. Visit https://leetcode.com
5. When the time limit prompt appears, set a short time (e.g., 10 seconds)
6. Wait for the countdown to reach 0

### Expected Result:
- ✅ A popup should appear with:
  - Green checkmark icon
  - "TIME_COMPLETE" title
  - Encouraging message
  - "Continue Working" button
  - "Visit [Site]" button (with a random redirect site)
- ✅ The tab should NOT close
- ✅ Console should show: "Sent productive time-up popup to tab [ID] for leetcode.com"
- ✅ Console should show: "Removed time limit for productive site: leetcode.com"

### If Tab Closes:
- Check browser console for errors
- Verify `leetcode.com` is in the productive sites list
- Check that the hostname matching is working (open DevTools and check `window.location.hostname`)

## Test Case 2: Distracting Site with Time Limit

### Steps:
1. Open the extension popup
2. Go to Settings → Limited tab
3. Verify that `youtube.com` is in the list (or add it)
4. Visit https://youtube.com
5. When the time limit prompt appears, set a short time (e.g., 10 seconds)
6. Wait for the countdown to reach 0

### Expected Result:
- ✅ The tab should close automatically
- ✅ No popup should appear
- ✅ Console should show: "Closed distracting site tab [ID] for youtube.com"
- ✅ Console should show: "Removed time limit for distracting site: youtube.com"

## Test Case 3: Redirect Sites Configuration

### Steps:
1. Open the extension popup
2. Go to Settings → Redirects tab
3. Add a new redirect site:
   - Name: "HackerRank"
   - URL: "https://hackerrank.com"
4. Click the + button
5. Verify the site appears in the list

### Expected Result:
- ✅ The site should appear with cyan accent color
- ✅ Name and URL should be displayed
- ✅ Remove button (×) should be visible

## Test Case 4: Popup Uses Custom Redirect Sites

### Steps:
1. Configure redirect sites (see Test Case 3)
2. Visit a productive site (e.g., leetcode.com)
3. Set a time limit and wait for it to expire

### Expected Result:
- ✅ The "Visit [Site]" button should show one of your configured redirect sites
- ✅ Clicking the button should navigate to that site

## Debugging Tips

### Check Console Logs:
Open the background script console:
- Chrome: `chrome://extensions/` → Click "service worker" or "background page"
- Firefox: `about:debugging#/runtime/this-firefox` → Click "Inspect" next to your extension

Look for these logs:
```
Sent productive time-up popup to tab [ID] for [hostname]
Removed time limit for productive site: [hostname]
Closed distracting site tab [ID] for [hostname]
Removed time limit for distracting site: [hostname]
```

### Check Content Script Console:
Open DevTools on the page (F12) and look for:
```
Content script received message: {type: "showProductiveTimeUpPopup"}
Showing productive time-up popup
```

### Verify Storage:
In the background console, run:
```javascript
browser.storage.local.get(['productiveSites', 'limitedSites', 'redirectSites', 'activeLimits']).then(console.log)
```

This should show:
- `productiveSites`: Array of productive site hostnames
- `limitedSites`: Array of limited site hostnames
- `redirectSites`: Array of {name, url} objects
- `activeLimits`: Object with active time limits

## Common Issues

### Issue: Tab still closes for productive sites
**Possible Causes:**
1. Site not in productive list
2. Hostname mismatch (e.g., `www.leetcode.com` vs `leetcode.com`)
3. Content script not loaded
4. Message not being received

**Solutions:**
1. Check productive sites list in settings
2. Add both variations of the hostname
3. Reload the page after installing the extension
4. Check console for errors

### Issue: Popup doesn't appear
**Possible Causes:**
1. Content script blocked by CSP
2. Message listener not registered
3. Popup already exists

**Solutions:**
1. Check console for CSP errors
2. Verify message listener is registered (check content script console)
3. Refresh the page

### Issue: "No tab with id" error
**Possible Causes:**
1. Tab was closed before message could be sent
2. Race condition in the code

**Solutions:**
1. This should be fixed with the processing lock
2. Check that `processingLimits` Set is working correctly
