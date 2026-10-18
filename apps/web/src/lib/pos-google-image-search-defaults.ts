/**
 * Same Google Custom Search credentials POS uses when Settings/DB/env are empty.
 * Documented in POS repo: `docs/IMAGE_SEARCH_SETUP.md` (`getImageSearchConfig` in `server/index.js`).
 */
export const POS_BUILTIN_GOOGLE_IMAGE_API_KEY = 'AIzaSyCMK06wL91WfWqUA8ijtgmlqWEdSZA6ETU';
export const POS_BUILTIN_GOOGLE_SEARCH_ENGINE_ID = '9580d86ee26594a48';

export const POS_GOOGLE_IMAGE_SEARCH_SETTING_KEYS = {
  apiKey: 'google_image_api_key',
  searchEngineId: 'google_search_engine_id',
} as const;
