# here are the detailed steps to obtain a `GOOGLE_MAPS_API_KEY` for integrating Google Maps and Places in your QuickPeek app:

### 1. Create a Google Cloud Project
1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Log in with your Google account if prompted.
3. In the top navigation bar, click on the project dropdown and select **New Project**.
4. Enter a project name (e.g., "QuickPeek App"), choose your preferred organization and location, then click **Create**.

### 2. Enable the Required APIs
Once your project is set up, you’ll need to enable APIs necessary for Maps and Places.

1. In the Google Cloud Console, ensure your new project is selected.
2. In the left-hand menu, navigate to **APIs & Services > Library**.
3. Search for and enable the following APIs by selecting each one and clicking **Enable**:
   - **Maps JavaScript API**
   - **Places API**
   - **Geocoding API** (optional, useful for converting addresses into coordinates if needed in future features)
4. Confirm that all required APIs are enabled by navigating to **APIs & Services > Dashboard**.

### 3. Generate Your API Key
1. In the Google Cloud Console, go to **APIs & Services > Credentials**.
2. Click **Create Credentials** at the top and select **API key**.
3. Your new API key will appear in a modal. Copy this key as it’s your `GOOGLE_MAPS_API_KEY`.

### 4. Restrict the API Key
To secure your API key, restrict it to only authorized apps and services.

1. In the **Credentials** section, locate your new API key and click on its name to open settings.
2. Under **Application restrictions**:
   - Select **HTTP referrers (websites)** if you’ll restrict it to certain domains (useful for deployed projects).
   - Select **Android apps** or **iOS apps** if applicable for mobile-specific restrictions.
3. Under **API restrictions**, select **Restrict key** and choose only the enabled APIs for the project, such as:
   - **Maps JavaScript API**
   - **Places API**
   - **Geocoding API**
4. Click **Save** to finalize the restrictions.

### 5. Add Your API Key to Your Environment Variables
For security, add the API key to an environment file and load it in your app.

1. In your project directory, create a `.env` file (if you don’t already have one).
2. Add the API key to your `.env` file:
   ```plaintext
   GOOGLE_MAPS_API_KEY=YOUR_API_KEY
   ```
3. Access this key in your app using `process.env.GOOGLE_MAPS_API_KEY` (ensure you have `react-native-dotenv` or similar installed to load environment variables).

That’s it! Your `GOOGLE_MAPS_API_KEY` should now be ready to use in the app for Google Maps and Places functionalities. Let me know if you have any questions!