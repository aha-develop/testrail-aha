/** @type {import('ts-jest').JestConfigWithTsJest} **/
module.exports = {
  testEnvironment: "node",
  transform: {
    "^.+\\.tsx?$": ["ts-jest", {
      tsconfig: { jsx: "react" },
      // The host declarations omit TestRow's existing class/kind="icon" props.
      // Keep its behavior tests runnable; tsc still checks the component.
      diagnostics: { exclude: ["**/src/components/tabs/TestRow.tsx"] },
    }],
  },
};
