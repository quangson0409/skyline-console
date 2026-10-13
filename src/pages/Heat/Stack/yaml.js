import yaml from 'js-yaml';

/**
 * YAML helpers for Heat templates / environment files - same library and calls as the
 * legacy console (js-yaml load / dump). Templates are still submitted to Heat as text.
 */
export class YamlError extends Error {
  constructor(msg) {
    super(msg);
    this.name = 'YamlError';
  }
}

/** Parses YAML (or JSON) text; throws YamlError on malformed input */
export const parseYaml = (text) => {
  try {
    return yaml.load(String(text ?? ''));
  } catch (err) {
    throw new YamlError(err.message);
  }
};

/** legacy getYaml: parsed value or null when the text is not valid YAML */
export const loadYaml = (text) => {
  try {
    return yaml.load(String(text ?? ''));
  } catch {
    return null;
  }
};

/** Serializes a value to block-style YAML (legacy yaml.dump) */
export const dumpYaml = (value) => (value === undefined ? '' : yaml.dump(value));
