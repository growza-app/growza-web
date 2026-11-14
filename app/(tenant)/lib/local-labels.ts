import { getMessages } from 'next-intl/server';
import { nounsIn } from './vertical-nouns';

/**
 * QA 2026-11-14 (F17) — a server page's vertical nouns in the reader's language, as the layout gives client
 * components (`LabelsProvider`). A page that read `me.labels` straight passed English to `pickNoun`, which then used
 * the generic Hindi word: a clinic's Hindi page titles said सेवाएँ / स्टाफ़ / ग्राहक, not परामर्श / डॉक्टर / मरीज़.
 */
export async function localLabels(labels: Record<string, string>): Promise<Record<string, string>> {
  const messages = (await getMessages()) as { verticalNouns?: Record<string, string> };
  return nounsIn(labels, messages.verticalNouns);
}
