/* @refresh reload */
import { render } from "solid-js/web";
import App from "./App";
import { I18nProvider } from "./i18n/I18nProvider";

render(
  () => (
    <I18nProvider>
      <App />
    </I18nProvider>
  ),
  document.getElementById("root")
);
