/** "0.7.0-alpha" -> "0.7.0 alpha": the release number shown in Settings. */
export const APP_VERSION: string = __APP_VERSION__;
export const APP_STAGE = APP_VERSION.includes('-') ? APP_VERSION.split('-')[1]! : '';
export const APP_NUMBER = APP_VERSION.split('-')[0]!;
