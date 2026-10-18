// jest.config.js
export default {
  preset: "ts-jest/presets/default-esm",
  testEnvironment: "node",

  extensionsToTreatAsEsm: [".ts"],

  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1",
    "^@/(.*)\\.js$": "<rootDir>/src/$1",
  },

  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        useESM: true,
      },
    ],
  },
};
