const CANDIDATE_BODY_MIN_LENGTH = 3;

function normalizeText(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function hasTranslatableText(text) {
  const compact = normalizeText(text);

  if (!compact) {
    return false;
  }

  if (/^https?:\/\/\S+$/i.test(compact)) {
    return false;
  }

  return /\p{Letter}/u.test(compact);
}

function isExplicitBodyText(text) {
  return hasTranslatableText(text);
}

function isCandidateBodyText(text) {
  const compact = normalizeText(text);

  if (compact.length < CANDIDATE_BODY_MIN_LENGTH) {
    return false;
  }

  return hasTranslatableText(compact);
}

module.exports = {
  hasTranslatableText,
  isExplicitBodyText,
  isCandidateBodyText,
  normalizeText
};
