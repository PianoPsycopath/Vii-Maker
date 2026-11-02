export const capitalize = str => str[0].toUpperCase() + str.slice(1);

export const formatIdentifier = str =>
  str.replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase());