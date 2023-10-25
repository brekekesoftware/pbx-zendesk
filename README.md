# Zendesk Widget

Zendesk Integration for the PBX Widget.

## Requirements
[Widget Server](https://sc01.brekeke.com:52398/us/pbx-integration/zendesk/-/tree/server) 

## Usage

1. Development
   - Install [zcli](https://developer.zendesk.com/documentation/apps/getting-started/using-zcli/)
   - Update the widgetUrl key in [zcli.apps.config.json](public/zcli.apps.config.json) file with your development/test widget server's URL.
   - Run the command `npm run zcli:dev` to start the development server.
2. Production
   - Run the command `npm run zcli:build` to build the Zendesk installer.
   - The installer zip file will be in the directory `dist/tmp`.

## Install in Zendesk

- Navigate to the Zendesk support apps page on your Zendesk domain EG: `https://[your-domain].zendesk.com/admin/apps-integrations/apps/support-apps`
- ![1 support apps.png](docs/images/1%20support%20apps.png)
- Select Upload private app, fill the fields with the app name and installer file, then Upload.
- ![2 fill new app fields.png](docs/images/2%20fill%20new%20app%20fields.png)
- Update the Widget URL field with the URL to your Widget Server and click install.
- ![3 app settings.png](docs/images/3%20app%20settings.png)
- The app should now appear among your installed apps.
- ![4 installed.png](docs/images/4%20installed.png)
- Now you can access the Widget from the top menu bar of your Zendesk dashboard.
- ![5 in-app.png](docs/images/5%20in-app.png)
