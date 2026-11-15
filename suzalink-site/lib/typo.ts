/**
 * French typography for content strings: no line break before « : ; ? ! » or inside « »,
 * and none inside « 5 174 », « 990 € », « 38 % ». Content files keep ordinary spaces:
 * this runs when the text is rendered.
 */
const NBSP = " ";

export function frTypo(text: string): string {
  return text
    .replace(/ ([:;?!»])/g, `${NBSP}$1`)
    .replace(/« /g, `«${NBSP}`)
    .replace(/(\d) (?=\d{3}(?!\d))/g, `$1${NBSP}`)
    .replace(/(\d) ([€%])/g, `$1${NBSP}$2`);
}
