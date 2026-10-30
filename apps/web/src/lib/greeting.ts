/** Set when somebody logs in to an existing account: the main screen then lets Pogo say "Welcome back!" once. */
let welcomeBack = false;
export const markWelcomeBack = () => {
  welcomeBack = true;
};
/** Is a greeting waiting? (Read without clearing, so a double render does not lose it.) */
export const welcomeBackPending = () => welcomeBack;
export const clearWelcomeBack = () => {
  welcomeBack = false;
};
