export function normalizeCityName(city: string): string {
  if (!city) return "";

  const turkishUpper = (str: string) => {
    return str
      .replace(/i/g, "İ")
      .replace(/ı/g, "I")
      .replace(/ş/g, "Ş")
      .replace(/ç/g, "Ç")
      .replace(/ğ/g, "Ğ")
      .replace(/ü/g, "Ü")
      .replace(/ö/g, "Ö")
      .toUpperCase();
  };

  const turkishLower = (str: string) => {
    return str
      .replace(/İ/g, "i")
      .replace(/I/g, "ı")
      .replace(/Ş/g, "ş")
      .replace(/Ç/g, "ç")
      .replace(/Ğ/g, "ğ")
      .replace(/Ü/g, "ü")
      .replace(/Ö/g, "ö")
      .toLowerCase();
  };

  return city
    .trim()
    .split(/\s+/)
    .map(word => {
      if (word.length === 0) return "";
      const firstChar = word.charAt(0);
      const rest = word.slice(1);
      return turkishUpper(firstChar) + turkishLower(rest);
    })
    .join(" ");
}
