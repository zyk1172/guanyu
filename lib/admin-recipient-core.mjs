function splitEmails(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

export function mergeAdminRecipientEmails(configuredValues = [], databaseEmails = []) {
  return [...configuredValues.flatMap(splitEmails), ...databaseEmails.flatMap(splitEmails)]
    .filter((email, index, list) => list.indexOf(email) === index);
}
