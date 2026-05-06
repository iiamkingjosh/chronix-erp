import coreWebVitals from "eslint-config-next/core-web-vitals";

const next = coreWebVitals.default ?? coreWebVitals;

/** @type {import("eslint").Linter.Config[]} */
const eslintConfig = [...next];

export default eslintConfig;
