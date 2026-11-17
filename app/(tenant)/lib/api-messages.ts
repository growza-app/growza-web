/**
 * Jira GRW-365 — the server's own sentences, in Hindi.
 *
 * The API writes its refusals in English (`detail`). Changing every one of ~290
 * of them into a code first would be a backend project; this is the cheap step
 * that already helps an owner: when the page is in Hindi and the sentence is one
 * we know, show the Hindi. Anything not listed shows the English exactly as
 * before — never a blank and never a wrong sentence.
 *
 * The key is the exact English sentence. That is deliberate and it is guarded:
 * `api-messages.test.ts` fails if a key no longer appears in `src/`, so
 * rewording a server sentence cannot silently orphan its translation.
 *
 * To add one: copy the English sentence from the API source, write its Hindi, and
 * run the test.
 */
export const API_MESSAGES_HI: Record<string, string> = {
  // ---- Jira GRW-72 — roles
  'This business has no roles to set up.': 'इस बिज़नेस में सेट करने के लिए कोई रोल नहीं है।',
  'Only the owner can change roles.': 'रोल सिर्फ़ मालिक बदल सकते हैं।',
  // Jira GRW-718 — Settings › Tables.
  'Only the owner can switch Table orders on or off.': 'टेबल ऑर्डर सिर्फ़ मालिक चालू या बंद कर सकते हैं।',
  // Jira GRW-719 — setting out tables.
  'Only the owner or a manager can set up tables.': 'टेबल सिर्फ़ मालिक या मैनेजर सेट कर सकते हैं।',
  'Table orders is off at this branch. The owner can switch it on in Settings › Tables.': 'इस ब्रांच में टेबल ऑर्डर बंद है। मालिक इसे सेटिंग › टेबल में चालू कर सकते हैं।',
  'That table or area is not at this branch.': 'यह टेबल या एरिया इस ब्रांच में नहीं है।',
  // Jira GRW-721 — a table's bill.
  'A table orders dishes at the table': 'टेबल पर सिर्फ़ डिश का ऑर्डर होता है',
  'Only the owner or a manager can take dishes off a table’s bill.': 'टेबल के बिल से डिश सिर्फ़ मालिक या मैनेजर हटा सकते हैं।',
  'This bill is already paid. Take a return instead.': 'इस बिल का भुगतान हो चुका है। इसकी जगह वापसी लें।',
  'Those dishes are not on this bill.': 'ये डिश इस बिल पर नहीं हैं।',
  // Jira GRW-722
  'Pick a different table.': 'कोई दूसरी टेबल चुनें।',
  'Pick the table to move to': 'वह टेबल चुनें जहाँ ले जाना है',
  'Pick the table to join': 'वह टेबल चुनें जिससे जोड़ना है',
  // Jira GRW-714 — the kitchen screen
  'This business has no kitchen screen.': 'इस बिज़नेस में किचन स्क्रीन नहीं है।',
  'That branch is not yours.': 'यह ब्रांच आपकी नहीं है।',
  'Say Ready or Undo': 'तैयार या वापस चुनें',
  'It is too late to undo. Ask the counter.': 'अब वापस नहीं हो सकता। काउंटर से कहें।',
  'Dish not found': 'डिश नहीं मिली',
  'Say whether the dish is done': 'बताएँ कि डिश बन गई या नहीं',
  'Only the owner can change this.': 'इसे सिर्फ़ मालिक बदल सकते हैं।',
  'A kitchen card can be late after 1 to 240 minutes': 'किचन कार्ड 1 से 240 मिनट बाद देर वाला माना जा सकता है',
  // Jira GRW-712 — add-ons
  'That choice is not on this item': 'यह विकल्प इस आइटम में नहीं है',
  'This business has no add-ons': 'इस बिज़नेस में ऐड-ऑन नहीं हैं',
  'This business has no add-ons.': 'इस बिज़नेस में ऐड-ऑन नहीं हैं।',
  'Too many add-ons on one line': 'एक लाइन पर बहुत ज़्यादा ऐड-ऑन हैं',
  'Give the group a name': 'ग्रुप का नाम लिखें',
  'Keep the name to 60 characters': 'नाम 60 अक्षरों तक रखें',
  'Say whether one or many can be picked': 'बताएँ कि एक चुन सकते हैं या कई',
  'Say whether a choice must be made': 'बताएँ कि चुनना ज़रूरी है या नहीं',
  'Give each choice a name': 'हर विकल्प का नाम लिखें',
  'Keep a choice to 60 characters': 'विकल्प 60 अक्षरों तक रखें',
  'Give each choice a price (0 is allowed)': 'हर विकल्प का दाम लिखें (0 भी चलेगा)',
  'A price cannot be below ₹0': 'दाम ₹0 से कम नहीं हो सकता',
  'Add at least one choice': 'कम से कम एक विकल्प जोड़ें',
  'At most 30 choices in a group': 'एक ग्रुप में ज़्यादा से ज़्यादा 30 विकल्प',
  'There is already a group with that name.': 'इस नाम का ग्रुप पहले से है।',
  'The fewest picks cannot be more than the most, or more than there are choices': 'कम से कम चुनाव, ज़्यादा से ज़्यादा से अधिक या विकल्पों की गिनती से अधिक नहीं हो सकता',
  'That group is not on your menu.': 'यह ग्रुप आपके मेन्यू में नहीं है।',
  'Only the owner or a manager can change the menu.': 'मेन्यू सिर्फ़ मालिक या मैनेजर बदल सकते हैं।',
  'Pick one of your groups': 'अपना कोई ग्रुप चुनें',
  // Jira GRW-737 — kitchen stock.
  'Only the owner or a manager can change these stock items.': 'स्टॉक का यह सामान सिर्फ़ मालिक या मैनेजर बदल सकते हैं।',
  'That item is already in your stock.': 'यह सामान आपके स्टॉक में पहले से है।',
  'That item is not in your stock.': 'यह सामान आपके स्टॉक में नहीं है।',
  'This item has stock history; make a new item instead.': 'इस सामान का स्टॉक पहले चल चुका है; इसकी जगह नया सामान बनाएँ।',
  'Its opening count is already in. Use a stock count to change it.': 'इसकी शुरुआती गिनती पहले ही दर्ज है। बदलने के लिए स्टॉक गिनती करें।',
  'That item is not on your list.': 'यह आपकी सूची में नहीं है।',
  'Pick which size this recipe is for.': 'चुनें कि यह रेसिपी किस साइज़ की है।',
  'Pick one of its sizes.': 'इसका कोई एक साइज़ चुनें।',
  'One of those items is not in your stock any more.': 'इनमें से एक सामान अब आपके स्टॉक में नहीं है।',
  'Use stock items from the same branch.': 'उसी ब्रांच का सामान इस्तेमाल करें।',
  'This business does not count what it uses.': 'यह बिज़नेस अपने इस्तेमाल का सामान नहीं गिनता।',
  // Jira GRW-739 — kitchen stock, part 3: prices are money, and a report reads up to 3 months.
  'Only the owner or a manager can see what things cost.': 'चीज़ें कितने की पड़ीं, यह सिर्फ़ मालिक या मैनेजर देख सकते हैं।',
  'Pick up to 3 months': 'ज़्यादा से ज़्यादा 3 महीने चुनें',
  // Jira GRW-738 — suppliers, stock in, wastage and counts.
  'That supplier is already on your list.': 'यह सप्लायर आपकी सूची में पहले से है।',
  'That supplier is not on your list.': 'यह सप्लायर आपकी सूची में नहीं है।',
  'That stock in is not on your list.': 'यह स्टॉक-इन आपकी सूची में नहीं है।',
  'Pick one of your suppliers.': 'अपना कोई सप्लायर चुनें।',
  'That line is not on this stock in any more. Open it again.': 'यह लाइन अब इस स्टॉक-इन में नहीं है। इसे फिर से खोलें।',
  'Pick today or an earlier date.': 'आज की या पहले की तारीख़ चुनें।',
  'This bill was entered before.': 'यह बिल पहले दर्ज हो चुका है।',
  'That count is not on your list.': 'यह गिनती आपकी सूची में नहीं है।',
  'This count was already finished.': 'यह गिनती पहले ही पूरी हो चुकी है।',
  'Type at least one count before you finish.': 'पूरा करने से पहले कम से कम एक गिनती लिखें।',
  'Only the owner or a manager can record stock in.': 'स्टॉक-इन सिर्फ़ मालिक या मैनेजर दर्ज कर सकते हैं।',
  'Only the owner or a manager can finish a count.': 'गिनती सिर्फ़ मालिक या मैनेजर पूरी कर सकते हैं।',
  'Only the kitchen, the owner or a manager can do this.': 'यह सिर्फ़ किचन, मालिक या मैनेजर कर सकते हैं।',
  'A phone number has 10 digits': 'फ़ोन नंबर में 10 अंक होते हैं',
  'A GSTIN has 15 letters and numbers': 'GSTIN में 15 अक्षर और अंक होते हैं',
  "Price can't be below zero": 'दाम शून्य से कम नहीं हो सकता',
  "GST can't be below zero": 'GST शून्य से कम नहीं हो सकता',
  'Type a price like 250': '250 जैसा दाम लिखें',
  'Pick why it was wasted': 'चुनें कि यह क्यों बर्बाद हुआ',
  'Say what happened': 'बताएँ कि क्या हुआ',
  'Add at least one item': 'कम से कम एक सामान जोड़ें',
  'Keep the pack name to 30 characters': 'पैक का नाम 30 अक्षरों तक रखें',
  'Keep the bill number to 40 characters': 'बिल नंबर 40 अक्षरों तक रखें',
  'Keep the note to 200 characters': 'नोट 200 अक्षरों तक रखें',
  'Was it already cooked? Say yes or no.': 'क्या यह पहले ही बन चुका था? हाँ या नहीं बताएँ।',
  'Type a quantity like 0.25': '0.25 जैसी मात्रा लिखें',
  'At most 10 groups on one item': 'एक आइटम पर ज़्यादा से ज़्यादा 10 ग्रुप',
  'That item or group is not on your menu.': 'यह आइटम या ग्रुप आपके मेन्यू में नहीं है।',
  // Jira GRW-724 — service charge
  'Only the owner can set the service charge.': 'सर्विस चार्ज सिर्फ़ मालिक तय कर सकते हैं।',
  'Say whether the service charge is offered': 'बताएँ कि सर्विस चार्ज लेना है या नहीं',
  'The service charge is 0 to 20%': 'सर्विस चार्ज 0 से 20% तक हो सकता है',
  'Say whether to add the service charge or take it off': 'बताएँ कि सर्विस चार्ज जोड़ना है या हटाना है',
  'The counter adds the service charge. A waiter can take it off if the guest says no.': 'सर्विस चार्ज काउंटर जोड़ता है। मेहमान मना करे तो वेटर इसे हटा सकता है।',
  'This bill is already paid, so its service charge cannot change.': 'यह बिल चुकता हो चुका है, इसलिए इसका सर्विस चार्ज नहीं बदल सकता।',
  'A service charge is only for a table’s bill.': 'सर्विस चार्ज सिर्फ़ टेबल के बिल पर लगता है।',
  'This branch does not offer a service charge. The owner can switch it on in Settings › Tables.': 'यह ब्रांच सर्विस चार्ज नहीं लेती। मालिक इसे सेटिंग › टेबल में चालू कर सकते हैं।',
  // Jira GRW-723 — a waiter
  'A waiter takes a table’s orders and its payment. Ask the counter for this.': 'वेटर सिर्फ़ टेबल का ऑर्डर और उसका पेमेंट लेता है। यह काम काउंटर से करवाएँ।',
  'A waiter cannot give a discount. Ask the counter.': 'वेटर छूट नहीं दे सकता। काउंटर से कहें।',
  'The counter prints the bill first. Then take the payment.': 'पहले काउंटर बिल छापेगा। फिर पेमेंट लें।',
  'Table orders is off at this branch. Switch it on in Settings › Tables before adding a waiter here.': 'इस ब्रांच में टेबल ऑर्डर बंद है। यहाँ वेटर जोड़ने से पहले सेटिंग › टेबल में इसे चालू करें।',
  // QA 2026-11-16
  'A takeaway order is not for a table': 'पैक करके ले जाने वाला ऑर्डर टेबल पर नहीं होता',
  'A table pays when the guests ask for the bill, not with the order': 'टेबल का बिल तब चुकता होता है जब मेहमान बिल माँगें, ऑर्डर के साथ नहीं',
  'This table’s bill has moved, joined another table or been paid. Open the table again.': 'इस टेबल का बिल दूसरी टेबल पर चला गया, जुड़ गया या चुकता हो गया। टेबल फिर से खोलें।',
  'That table is not at this branch.': 'यह टेबल इस ब्रांच में नहीं है।',
  'That table is at another branch.': 'यह टेबल दूसरी ब्रांच की है।',
  // Jira GRW-720 — how an order is eaten.
  'Table orders is off at this branch.': 'इस ब्रांच में टेबल ऑर्डर बंद है।',
  'Choose Dine-in or Takeaway': 'यहीं खाना या पैक करके चुनें',
  'A delivery app’s order is a delivery': 'डिलीवरी ऐप का ऑर्डर डिलीवरी ही होता है',
  'Only the owner or a manager can change how an order is eaten.': 'ऑर्डर कैसे खाया जाए, यह सिर्फ़ मालिक या मैनेजर बदल सकते हैं।',
  'A delivery app’s order is always a delivery.': 'डिलीवरी ऐप का ऑर्डर हमेशा डिलीवरी होता है।',
  'This order is already done.': 'यह ऑर्डर पूरा हो चुका है।',
  'The bill is printed, so this order stays as it was billed.': 'बिल छप चुका है, इसलिए ऑर्डर वैसा ही रहेगा जैसा बिल हुआ।',
  'A manager needs a role. Choose one, or remove them from the team.': 'मैनेजर का कोई रोल होना ज़रूरी है। एक रोल चुनें, या उन्हें टीम से हटा दें।',
  'There is no such role.': 'ऐसा कोई रोल नहीं है।',
  'Say why it cannot be sold again': 'बताएँ कि यह दोबारा क्यों नहीं बिक सकता',
  'There is no such page.': 'ऐसा कोई पेज नहीं है।',
  'Give the role a name': 'रोल को एक नाम दें',
  'Keep the name under 60 letters': 'नाम 60 अक्षरों से कम रखें',
  'Check the role': 'रोल जाँचें',
  'Change the branch and the role one at a time.': 'शाखा और रोल एक-एक करके बदलें।',
  'You already have a role with this name.': 'इस नाम का रोल पहले से है।',
  'Some people still have this role. Give them another role first.': 'कुछ लोगों के पास अभी यह रोल है। पहले उन्हें कोई दूसरा रोल दें।',
  'Some people have this role, so what it works like cannot change.': 'कुछ लोगों के पास यह रोल है, इसलिए इसकी तरह काम करना बदला नहीं जा सकता।',
  'Choose one of your roles.': 'अपने रोल में से कोई चुनें।',
  'This role cannot be given to someone yet. Choose another.': 'यह रोल अभी किसी को दिया नहीं जा सकता। कोई दूसरा चुनें।',
  'Choose a role.': 'एक रोल चुनें।',
  'Your role does not let you do this.': 'आपका रोल आपको यह करने नहीं देता।',
  'Only the owner can give the manager role.': 'मैनेजर का रोल सिर्फ़ मालिक दे सकते हैं।',
  'The owner does not need a role.': 'मालिक को रोल की ज़रूरत नहीं।',
  'This role works differently from what this person does now. Invite them again with the new role.': 'यह रोल इस व्यक्ति के मौजूदा काम से अलग तरह से चलता है। उन्हें नए रोल के साथ फिर से न्योता भेजें।',
  // ---- Owner, 2026-10-18 — loading products from a spreadsheet
  'Upload a .xlsx or .csv file.': '.xlsx या .csv फ़ाइल अपलोड करें।',
  'That file has no rows in it.': 'उस फ़ाइल में कोई पंक्ति नहीं है।',
  'That file has column headings but nothing under them.': 'उस फ़ाइल में सिर्फ़ कॉलम के नाम हैं, उनके नीचे कुछ नहीं है।',
  'That is the older .xls format — re-save it as .xlsx or .csv and try again.': 'यह पुराना .xls फ़ॉर्मेट है — इसे .xlsx या .csv में फिर से सेव करके दोबारा कोशिश करें।',
  "That product is not on this branch's shelf": 'वह प्रोडक्ट इस ब्रांच की शेल्फ़ पर नहीं है',
  'Give the product a name': 'प्रोडक्ट को एक नाम दें',
  'Give the product a price': 'प्रोडक्ट की कीमत डालें',
  // ---- Jira GRW-478 (U-3) — sentences added by the GRW-463 fixes
  'A name must be text, 80 characters or fewer': 'नाम 80 अक्षरों तक का टेक्स्ट होना चाहिए',
  'A note must be text, 500 characters or fewer': 'नोट 500 अक्षरों तक का टेक्स्ट होना चाहिए',
  'Choose one of your current stylists.': 'अपने मौजूदा स्टाइलिस्ट में से किसी को चुनें।',
  'Nobody who does this is free at that time. Pick another.': 'उस समय यह काम करने वाला कोई खाली नहीं है। कोई दूसरा समय चुनें।',
  'That day has already gone. Pick today or a later day.': 'वह दिन बीत चुका है। आज या आगे का कोई दिन चुनें।',
  'That time was just taken. Pick another.': 'वह समय अभी-अभी भर गया। कोई दूसरा चुनें।',
  'That time is already taken. Pick another time.': 'वह समय पहले से भरा है। कोई दूसरा समय चुनें।',
  'This package costs more than its services do on their own. Check the price, or confirm it is right.': 'इस पैकेज का दाम इसकी सेवाओं के अलग-अलग दाम से ज़्यादा है। दाम जाँचें, या पक्का करें कि यह सही है।',
  'The owner cannot be removed from their own business.': 'मालिक को उनके अपने बिज़नेस से हटाया नहीं जा सकता।',
  'You cannot remove yourself. Ask the owner.': 'आप ख़ुद को नहीं हटा सकते। मालिक से कहें।',
  'This number is not part of a business any more. Ask the owner to invite you again.': 'यह नंबर अब किसी बिज़नेस से जुड़ा नहीं है। मालिक से फिर से न्योता भेजने को कहें।',
  'One of the dates in this request is not a real day.': 'इस अनुरोध की एक तारीख़ असली दिन नहीं है।',
  'The page size or position in this request is not valid.': 'इस अनुरोध में पेज का आकार या जगह सही नहीं है।',
  // ---- sign-in and passwords
  'Phone number or password is incorrect.': 'फ़ोन नंबर या पासवर्ड ग़लत है।',
  'Phone number and password are required.': 'फ़ोन नंबर और पासवर्ड ज़रूरी हैं।',
  'Too many attempts. Please wait a few minutes and try again.': 'बहुत ज़्यादा कोशिशें हुईं। कृपया कुछ मिनट रुककर फिर कोशिश करें।',
  'Too many requests. Please wait a moment and try again.': 'बहुत ज़्यादा अनुरोध हुए। कृपया थोड़ी देर रुककर फिर कोशिश करें।',
  'Too many sign-in attempts. Please wait a few minutes and try again.': 'साइन इन की बहुत ज़्यादा कोशिशें हुईं। कृपया कुछ मिनट रुककर फिर कोशिश करें।',
  'That is not your current password.': 'यह आपका मौजूदा पासवर्ड नहीं है।',
  'That is your current password. Choose a different one.': 'यह आपका मौजूदा पासवर्ड ही है। कोई दूसरा चुनें।',
  'Choose a password of at least 8 characters.': 'कम से कम 8 अक्षर का पासवर्ड चुनें।',
  'That password does not meet the requirements.': 'यह पासवर्ड ज़रूरी शर्तें पूरी नहीं करता।',
  'That password was refused. Try a longer one.': 'यह पासवर्ड मंज़ूर नहीं हुआ। थोड़ा लंबा आज़माएँ।',
  'That password was refused. Try a longer one, with a mix of letters, numbers and symbols.': 'यह पासवर्ड मंज़ूर नहीं हुआ। अक्षर, अंक और चिह्नों के मेल वाला थोड़ा लंबा पासवर्ड आज़माएँ।',
  'That temporary password is not valid. Ask Growza for a new one.': 'वह अस्थायी पासवर्ड सही नहीं है। Growza से नया माँगें।',
  'This is a one-time password. Choose your own to finish signing in.': 'यह एक बार वाला पासवर्ड है। साइन इन पूरा करने के लिए अपना पासवर्ड चुनें।',
  'Sign in with your phone number to change your password.': 'पासवर्ड बदलने के लिए अपने फ़ोन नंबर से साइन इन करें।',
  'This account has no password on file to replace. Ask for it to be reset instead.': 'इस अकाउंट में बदलने के लिए कोई पासवर्ड दर्ज नहीं है। इसके बजाय रीसेट करवाएँ।',
  'Could not reach the sign-in service, so your password was not changed. Try again shortly.': 'साइन इन सेवा तक नहीं पहुंच सके, इसलिए आपका पासवर्ड नहीं बदला। थोड़ी देर में फिर कोशिश करें।',
  'Phone number, the temporary password and a new password are all required.': 'फ़ोन नंबर, अस्थायी पासवर्ड और नया पासवर्ड, तीनों ज़रूरी हैं।',
  'Your current password and a new one are both required.': 'आपका मौजूदा पासवर्ड और नया पासवर्ड, दोनों ज़रूरी हैं।',
  // ---- team and invites
  'This invite is no longer valid.': 'यह निमंत्रण अब मान्य नहीं है।',
  'You are already on this team.': 'आप पहले से इस टीम में हैं।',
  'This number already has a Growza account. Sign in with your existing password to join this team.': 'इस नंबर पर पहले से Growza अकाउंट है। इस टीम से जुड़ने के लिए अपने मौजूदा पासवर्ड से साइन इन करें।',
  'Choose which stylist this login is for.': 'चुनें कि यह लॉगिन किस स्टाइलिस्ट के लिए है।',
  'Choose which branch this receptionist works at.': 'इस रिसेप्शनिस्ट की ब्रांच चुनें।',
  'Enter their name.': 'उनका नाम डालें।',
  'Only a receptionist has a branch of their own. A stylist works where their calendar is.': 'सिर्फ़ रिसेप्शनिस्ट की अपनी ब्रांच होती है। स्टाइलिस्ट वहीं काम करता है जहाँ उसका कैलेंडर है।',
  // ---- branches
  'Choose one of your branches.': 'अपनी किसी एक ब्रांच को चुनें।',
  'Pick one of your open branches.': 'अपनी किसी खुली ब्रांच को चुनें।',
  'That stylist works at another branch.': 'वह स्टाइलिस्ट दूसरी ब्रांच में हैं।',
  'You work at another branch.': 'आप दूसरी ब्रांच में काम करते हैं।',
  // ---- forms
  'A reason is required for this action.': 'इस काम के लिए कारण बताना ज़रूरी है।',
  'Enter a 10-digit mobile number': '10 अंक का मोबाइल नंबर लिखें',
  'Nothing to change': 'बदलने के लिए कुछ नहीं',
  'Choose who did this': 'चुनें कि यह किसने किया',
  'Choose who will take them': 'चुनें कि उन्हें कौन लेगा',
  'Pick what they are having': 'चुनें कि वे क्या करवा रहे हैं',
  'Pick what they are having first': 'पहले चुनें कि वे क्या करवा रहे हैं',
  'A name is needed, even a first name': 'नाम चाहिए, पहला नाम भी चलेगा',
  'Add at least one service before saving': 'सेव करने से पहले कम से कम एक सेवा जोड़ें',
  // Owner, 2026-11-14 (returns QA, loophole 1) — a manager takes returns at their own branch only.
  'You can take returns only at your own branch.': 'आप सिर्फ़ अपनी शाखा पर ही वापसी ले सकते हैं।',
  'That request was not valid.': 'वह अनुरोध सही नहीं था।',
  'Something went wrong handling this request.': 'इस अनुरोध को संभालते समय कुछ गड़बड़ हो गई।',
  // ---- bookings, visits and clients
  'That slot was just taken': 'वह स्लॉट अभी-अभी भर गया',
  'That service is not available': 'वह सेवा उपलब्ध नहीं है',
  'That staff member is not available': 'वह स्टाफ़ सदस्य उपलब्ध नहीं है',
  // Owner, 2026-10-14 — the till sells products.
  'Pick at least one service or product': 'कम से कम एक सेवा या सामान चुनें',
  // QA 2026-10-23 — a booking's own refusals, in plain words rather than the validator's.
  'Pick at least one service': 'कम से कम एक सेवा चुनें',
  'That is too many services for one booking': 'एक बुकिंग के लिए इतनी सेवाएँ बहुत ज़्यादा हैं',
  'Pick a day and time for the booking': 'बुकिंग के लिए दिन और समय चुनें',
  'Say how they paid': 'बताएँ कि पैसे कैसे दिए',
  // QA 2026-11-06 — the till's refusals of an amount, reworded from JSON keys into what is wrong with it.
  'Enter the amount as a number': 'रकम अंकों में लिखें',
  'Enter the amount in whole paise, with no fraction': 'रकम पूरे पैसों में लिखें, पैसे का हिस्सा नहीं',
  'The amount cannot be less than ₹0': 'रकम ₹0 से कम नहीं हो सकती',
  'Enter the package price as a number': 'पैकेज की कीमत अंकों में लिखें',
  'Enter the bill amount as a number, ₹0 or more': 'बिल की रकम अंकों में लिखें, ₹0 या उससे ज़्यादा',
  'That item is not for sale here': 'यह चीज़ यहाँ बिक्री के लिए नहीं है',
  // Jira GRW-607 — a business that takes no bookings, or sells no services (a shop).
  'This business does not take bookings.': 'यह बिज़नेस बुकिंग नहीं लेता।',
  'This business does not sell services.': 'यह बिज़नेस सेवाएँ नहीं बेचता।',
  'That product is sold at another branch': 'वह सामान दूसरी ब्रांच में बिकता है',
  'Something by that name is already on your list': 'इस नाम की चीज़ आपकी सूची में पहले से है',
  'This plan does not sell products over the counter.': 'इस प्लान में काउंटर पर सामान बेचना शामिल नहीं है।',
  'The sales register is not open to your role': 'बिक्री का रजिस्टर आपकी भूमिका के लिए खुला नहीं है',
  'There is not enough stock at this branch to move that many': 'इस ब्रांच में इतना स्टॉक नहीं है कि इतना भेजा जा सके',
  // QA, 2026-10-17 — what the product routes answer with a 400 or 404.
  'Product not found': 'सामान नहीं मिला',
  'Category not found': 'श्रेणी नहीं मिली',
  'No such category at this branch': 'इस ब्रांच में ऐसी कोई श्रेणी नहीं है',
  'Send the branch’s categories in the order you want them': 'ब्रांच की श्रेणियाँ उसी क्रम में भेजें जिसमें आप उन्हें चाहते हैं',
  'That is not this branch’s list of categories': 'यह इस ब्रांच की श्रेणियों की सूची नहीं है',
  // Release review, 2026-10-17 — sentences the product, transfer and till routes can send.
  'Choose a branch': 'एक ब्रांच चुनें',
  // Jira GRW-621 — a marketplace's seller keys.
  'Paste the keys': 'चाबियाँ चिपकाएँ',
  'Saving keys is not set up on this server yet.': 'इस सर्वर पर चाबियाँ सहेजना अभी सेट नहीं है।',
  'A count goes with a recount only': 'गिनती सिर्फ़ दोबारा गिनने के साथ दी जा सकती है',
  'That amount is too large': 'यह रकम बहुत बड़ी है',
  'Description must be text': 'विवरण लिखा हुआ होना चाहिए',
  'Description must be 200 characters or fewer': 'विवरण ज़्यादा से ज़्यादा 200 अक्षर का हो सकता है',
  'Name the package on the request or on its lines, not both': 'पैकेज का नाम पूरे बिल पर लिखें या उसकी लाइनों पर, दोनों पर नहीं',
  // Jira GRW-574 — a product's SKU, barcode (0119), GST rate and HSN (0120).
  'Another product at this branch has that SKU': 'इस ब्रांच में किसी दूसरे सामान का यही SKU है',
  'Another product at this branch has that barcode': 'इस ब्रांच में किसी दूसरे सामान का यही बारकोड है',
  'Type the barcode as it is printed, with no spaces': 'बारकोड वैसे ही लिखें जैसा छपा है, बीच में जगह न छोड़ें',
  'A SKU is 40 characters at most': 'SKU ज़्यादा से ज़्यादा 40 अक्षर का हो सकता है',
  'A barcode is 64 characters at most': 'बारकोड ज़्यादा से ज़्यादा 64 अक्षर का हो सकता है',
  'GST rate must be between 0% and 28%': 'GST दर 0% से 28% के बीच होनी चाहिए',
  'An HSN code is 4 to 8 digits': 'HSN कोड 4 से 8 अंकों का होना चाहिए',
  'A SAC code is 4 to 8 digits': 'SAC कोड 4 से 8 अंकों का होना चाहिए',
  'Choose another branch': 'कोई दूसरी ब्रांच चुनें',
  'No such branch': 'ऐसी कोई ब्रांच नहीं है',
  'Say how many': 'बताएँ कितने',
  'That count is too large': 'वह गिनती बहुत बड़ी है',
  'That note is too long': 'वह नोट बहुत लंबा है',
  'Only the owner can move stock between branches.': 'ब्रांचों के बीच स्टॉक सिर्फ़ मालिक भेज सकता है।',
  'Only the owner can count stock.': 'स्टॉक की गिनती सिर्फ़ मालिक कर सकता है।',
  'Say what the count is': 'बताएँ गिनती क्या है',
  'That count is too small': 'वह गिनती बहुत छोटी है',
  'Count at least one product': 'कम से कम एक सामान की गिनती करें',
  'Too many products to count at once': 'एक बार में इतने सामान की गिनती नहीं हो सकती',
  'Each product can be counted once': 'हर सामान की गिनती एक ही बार हो सकती है',
  'One of those services does not exist.': 'उनमें से एक सेवा मौजूद नहीं है।',
  'Appointment not found': 'बुकिंग नहीं मिली',
  'No such booking': 'ऐसी कोई बुकिंग नहीं',
  /*
   * Jira GRW-612 — an order's state. The refusal that names the state and the moves it has is built from
   * `moveRefusal` in @growza-app/shared and arrives as one sentence; the words inside it ("Delivered", "Came back")
   * are the state names, whose Hindi is in `messages/*.json` under `orders.states` for the screens to use.
   */
  'There is no such order.': 'ऐसा कोई ऑर्डर नहीं है।',
  'This order was not placed on a marketplace.': 'यह ऑर्डर किसी मार्केटप्लेस पर नहीं आया था।',
  'This order belongs to another branch.': 'यह ऑर्डर दूसरी ब्रांच का है।',
  'A counter sale is rung up with its client and keeps it.': 'काउंटर पर बिक्री अपने ग्राहक के नाम बनती है और उसी के नाम रहती है।',
  'This business does not sell over a counter.': 'यह कारोबार काउंटर पर बिक्री नहीं करता।',
  // Jira GRW-613 — a marketplace buyer who is not in the client list, and attaching a client the owner recognises.
  'This order already has a client.': 'इस ऑर्डर में पहले से ग्राहक जुड़ा है।',
  'That client is not available.': 'वह ग्राहक उपलब्ध नहीं है।',
  'That is not a client.': 'यह कोई ग्राहक नहीं है।',
  'There is no such branch.': 'ऐसी कोई ब्रांच नहीं है।',
  // Jira GRW-617 — swapping a size on a bill.
  'A size can only be swapped for another size of the same product.': 'साइज़ सिर्फ़ उसी प्रोडक्ट के दूसरे साइज़ से बदला जा सकता है।',
  'Only a size can be swapped. For a different product, take the return and sell the new one.': 'सिर्फ़ साइज़ बदला जा सकता है। दूसरे प्रोडक्ट के लिए वापसी लें और नया बेचें।',
  'Request id is missing.': 'रिक्वेस्ट आईडी नहीं मिली।',
  'That is the size already on the bill. Choose a different size.': 'यही साइज़ बिल पर पहले से है। कोई दूसरा साइज़ चुनें।',
  'That line is not on this order': 'यह आइटम इस ऑर्डर में नहीं है',
  // Owner, 4 Nov 2026 — handing an order over the counter, now a fact the whole shop shares rather than one phone's.
  'Say whether it has been handed over.': 'बताएँ कि ऑर्डर दे दिया गया है या नहीं।',
  'Take payment for this order before handing it over.': 'ऑर्डर देने से पहले उसका पैसा ले लें।',
  'The price changed. Check the new amount.': 'कीमत बदल गई है। नई रकम देखें।',
  // Jira GRW-618 — a marketplace's own codes for the shop's sizes.
  'That product is not valid': 'यह प्रोडक्ट सही नहीं है',
  'There is no such code.': 'ऐसा कोई कोड नहीं है।',
  'Search must be one piece of text.': 'खोज एक ही टेक्स्ट होनी चाहिए।',
  'That is too many styles for one file. Pick a branch or a category and try again.': 'एक फ़ाइल के लिए स्टाइल बहुत ज़्यादा हैं। कोई ब्रांच या श्रेणी चुनें और फिर कोशिश करें।',
  'This business has no sales reports for a shop.': 'इस कारोबार के लिए दुकान की बिक्री रिपोर्ट नहीं है।',
  'Choose a branch to see its categories.': 'श्रेणियाँ देखने के लिए कोई ब्रांच चुनें।',
  'This business has no reorder list.': 'इस कारोबार में दोबारा मँगाने की सूची नहीं है।',
  'Give both the lead time and the days to cover, or neither.': 'मँगाने में लगने वाले दिन और कितने दिन का माल चाहिए, दोनों दें या कोई नहीं।',
  'Lead time is a whole number of days from 0 to 365.': 'मँगाने में लगने वाले दिन 0 से 365 के बीच की पूरी संख्या होने चाहिए।',
  'Days to cover is a whole number from 1 to 365.': 'कितने दिन का माल चाहिए, यह 1 से 365 के बीच की पूरी संख्या होनी चाहिए।',
  'Those are not the days of an order.': 'ये किसी ऑर्डर के दिन नहीं हैं।',
  'Order a whole number from 0 to 1,000,000.': '0 से 1,000,000 के बीच की पूरी संख्या मँगाएँ।',
  'That is too many sizes for one file. Pick a branch or a category and try again.': 'एक फ़ाइल के लिए साइज़ बहुत ज़्यादा हैं। कोई ब्रांच या श्रेणी चुनें और फिर कोशिश करें।',
  'Choose a size': 'कोई साइज़ चुनें',
  'Choose the days of the order': 'ऑर्डर के दिन चुनें',
  'Order a whole number': 'पूरी संख्या मँगाएँ',
  'Choose a category': 'कोई श्रेणी चुनें',
  'Lead time is a whole number of days': 'मँगाने में लगने वाले दिन पूरी संख्या होने चाहिए',
  'Days to cover is a whole number': 'कितने दिन का माल चाहिए, यह पूरी संख्या होनी चाहिए',
  'Check the numbers': 'संख्याएँ जाँचें',
  'Check the number': 'संख्या जाँचें',
  'This business has no sales by channel.': 'इस कारोबार में चैनल के हिसाब से बिक्री नहीं है।',
  'Fees kept by a marketplace or a delivery app are not taken off these numbers. This is what was billed, not what you were paid.': 'मार्केटप्लेस या डिलीवरी ऐप की फ़ीस इन संख्याओं में से नहीं घटाई गई है। यह बिल की रकम है, आपको मिली रकम नहीं।',
  'An order from a delivery app is returned and refunded by the app, not here.': 'डिलीवरी ऐप का ऑर्डर ऐप ही वापस लेता है और पैसे लौटाता है, यहाँ नहीं।',
  'An order number goes with a delivery app': 'ऑर्डर नंबर सिर्फ़ डिलीवरी ऐप के ऑर्डर के साथ दिया जाता है',
  'This business does not sell on marketplaces.': 'यह बिज़नेस मार्केटप्लेस पर नहीं बेचता।',
  'Choose a channel from the list.': 'सूची में से कोई चैनल चुनें।',
  'That order is not one the shop has': 'यह ऑर्डर दुकान के पास नहीं है',
  'This business has no returns report.': 'इस कारोबार में वापसी की रिपोर्ट नहीं है।',
  'Say whether the customer sent it back or the parcel came back undelivered': 'बताएँ कि ग्राहक ने भेजा या पार्सल बिना पहुँचे लौट आया',
  'Choose one of the reasons': 'कारणों में से कोई एक चुनें',
  'Say what the reason was': 'बताएँ कि कारण क्या था',
  'A counter sale has no marketplace return': 'काउंटर की बिक्री की कोई मार्केटप्लेस वापसी नहीं होती',
  'A counter sale has no parcel that can come back undelivered': 'काउंटर की बिक्री का कोई पार्सल बिना पहुँचे नहीं लौट सकता',
  'That marketplace return was already recorded against another order': 'यह मार्केटप्लेस वापसी पहले ही किसी और ऑर्डर के नाम दर्ज है',
  'Keep the reason to 240 characters': 'कारण 240 अक्षरों तक रखें',
  'The marketplace return id is empty': 'मार्केटप्लेस वापसी की आईडी खाली है',
  'The marketplace return id is too long': 'मार्केटप्लेस वापसी की आईडी बहुत लंबी है',
  'The marketplace return id must be 1 to 120 characters': 'मार्केटप्लेस वापसी की आईडी 1 से 120 अक्षर की होनी चाहिए',
  'This business has no online orders to record refunds on.': 'इस कारोबार में रिफ़ंड दर्ज करने के लिए ऑनलाइन ऑर्डर नहीं हैं।',
  'This business has no refunds report.': 'इस कारोबार में रिफ़ंड की रिपोर्ट नहीं है।',
  'A refund is an amount above zero': 'रिफ़ंड शून्य से ज़्यादा की रकम होता है',
  'Choose the line that came back': 'वह लाइन चुनें जो वापस आई',
  'Say who made the refund: the marketplace or the shop': 'बताएँ कि रिफ़ंड किसने किया: मार्केटप्लेस ने या दुकान ने',
  'The marketplace reference is needed': 'मार्केटप्लेस का रेफ़रेंस चाहिए',
  'The marketplace reference must be 1 to 120 characters': 'मार्केटप्लेस रेफ़रेंस 1 से 120 अक्षर का होना चाहिए',
  'Give the date the refund was made': 'रिफ़ंड की तारीख़ दें',
  'Check the refund': 'रिफ़ंड जाँचें',
  'Order not found': 'ऑर्डर नहीं मिला',
  // Owner, 9 Nov 2026 — the Queue's Cancel and Add items, refused on an order that is no longer waiting for payment.
  'This order is already paid. Take a return instead.': 'इस ऑर्डर का पेमेंट हो चुका है। इसकी जगह रिटर्न करें।',
  'This order is already paid. Start a new order for anything more.': 'इस ऑर्डर का पेमेंट हो चुका है। और कुछ के लिए नया ऑर्डर शुरू करें।',
  'This order was cancelled. Start a new order instead.': 'यह ऑर्डर रद्द हो चुका है। इसकी जगह नया ऑर्डर शुरू करें।',
  'Pick at least one product': 'कम से कम एक प्रोडक्ट चुनें',
  'A refund needs the line that came back': 'रिफ़ंड के लिए वापस आई लाइन चाहिए',
  'A counter sale is refunded when the product is returned, not recorded here': 'काउंटर की बिक्री का रिफ़ंड प्रोडक्ट लौटाने पर ही होता है, यहाँ दर्ज नहीं होता',
  'A refund cannot be dated in the future': 'रिफ़ंड की तारीख़ आगे की नहीं हो सकती',
  'A refund cannot be dated before the order': 'रिफ़ंड की तारीख़ ऑर्डर से पहले की नहीं हो सकती',
  'That marketplace reference was already recorded against another order': 'यह मार्केटप्लेस रेफ़रेंस पहले ही किसी और ऑर्डर के नाम दर्ज है',
  'A refund follows a return, and nothing has been returned on that line yet': 'रिफ़ंड वापसी के बाद होता है, और उस लाइन पर अभी कुछ वापस नहीं आया',
  'That is too many refunds for one file. Pick a channel or a shorter period and try again.': 'एक फ़ाइल के लिए रिफ़ंड बहुत ज़्यादा हैं। कोई चैनल या छोटी अवधि चुनें और फिर कोशिश करें।',
  'There is no such category.': 'ऐसी कोई श्रेणी नहीं है।',
  'This business has no stock report.': 'इस कारोबार में स्टॉक रिपोर्ट नहीं है।',
  'This business has no marketplace codes.': 'इस कारोबार में मार्केटप्लेस कोड नहीं हैं।',
  // Jira GRW-614 — the Orders list.
  'This business has no Orders screen.': 'इस कारोबार में ऑर्डर वाली स्क्रीन नहीं है।',
  'Page must be a whole number from 1.': 'पेज 1 से शुरू होने वाली पूरी संख्या होना चाहिए।',
  'The keys were turned down. Replace them first.': 'चाबियाँ मना कर दी गई हैं। पहले उन्हें बदलें।',
  'Page size must be a whole number from 1 to 100.': 'पेज का आकार 1 से 100 के बीच की पूरी संख्या होना चाहिए।',
  'Search with some text.': 'खोजने के लिए कुछ लिखें।',
  'No such client': 'ऐसा कोई ग्राहक नहीं',
  'That client record is not available': 'वह ग्राहक रिकॉर्ड उपलब्ध नहीं है',
  'That client asked to be deleted': 'उस ग्राहक ने हटाने को कहा था',
  'That number belongs to a client who was deleted. Restore them first, or use a different number.': 'यह नंबर एक हटाए गए ग्राहक का है। पहले उन्हें वापस लाएँ, या दूसरा नंबर इस्तेमाल करें।',
  'This visit has already been recorded': 'यह विज़िट पहले ही दर्ज हो चुकी है',
  'This walk-in is no longer waiting': 'यह वॉक-इन अब इंतज़ार में नहीं है',
  'This token has already been given to a stylist or paid': 'यह टोकन पहले ही स्टाइलिस्ट को दिया जा चुका है या इसका भुगतान हो चुका है',
  // Jira GRW-405 — "Arrived" on a booking.
  'That booking is not for today': 'यह बुकिंग आज की नहीं है',
  'That booking is not open any more. It was cancelled, missed or is already done': 'यह बुकिंग अब खुली नहीं है। यह रद्द हो गई, ग्राहक नहीं आए, या पूरी हो चुकी है',
  'That visit was not booked ahead': 'यह विज़िट पहले से बुक नहीं थी',
  'Booking not found': 'बुकिंग नहीं मिली',
  'Choose a booking': 'कोई बुकिंग चुनें',
  'Could not add that service — the provider is busy right now': 'वह सेवा जोड़ी नहीं जा सकी — स्टाफ़ अभी व्यस्त हैं',
  'That stylist works at another branch. Choose someone at the branch this client is waiting at.': 'वह स्टाइलिस्ट दूसरी ब्रांच में हैं। उस ब्रांच का कोई चुनें जहाँ यह ग्राहक इंतज़ार कर रहा है।',
  'This visit already has a stylist, was never recorded without one, or does not exist': 'इस विज़िट में पहले से स्टाइलिस्ट है, या यह बिना स्टाइलिस्ट के कभी दर्ज नहीं हुई, या मौजूद नहीं है',
  'That visit was not today — only an owner can put a stylist on it now': 'वह विज़िट आज की नहीं थी — अब सिर्फ़ मालिक ही उसमें स्टाइलिस्ट जोड़ सकता है',
  'This stylist is not shown their own takings': 'इस स्टाइलिस्ट को अपनी कमाई नहीं दिखती',
  // ---- payment
  'Online payment is not set up yet. Please call Growza support to pay.': 'ऑनलाइन भुगतान अभी शुरू नहीं हुआ है। भुगतान के लिए कृपया Growza सपोर्ट को कॉल करें।',
  'Automatic payment is not set up yet. Please call Growza support.': 'ऑटोमैटिक भुगतान अभी शुरू नहीं हुआ है। कृपया Growza सपोर्ट को कॉल करें।',
  'We could not reach the payment service just now. Please try again in a few minutes.': 'अभी भुगतान सेवा तक नहीं पहुंच सके। कृपया कुछ मिनट में फिर कोशिश करें।',
  'We could not start the payment just now. Please try again in a few minutes, or call Growza support to pay.': 'अभी भुगतान शुरू नहीं हो सका। कृपया कुछ मिनट में फिर कोशिश करें, या भुगतान के लिए Growza सपोर्ट को कॉल करें।',
  'AutoPay is already set up.': 'ऑटोपे पहले से चालू है।',
  'There is nothing to pay right now.': 'अभी चुकाने के लिए कुछ नहीं है।',
  'There is no active plan on this account.': 'इस अकाउंट पर कोई चालू प्लान नहीं है।',
  'Online payment is not available for this account.': 'इस अकाउंट के लिए ऑनलाइन भुगतान उपलब्ध नहीं है।',
  'Automatic payment is not available for this account.': 'इस अकाउंट के लिए ऑटोमैटिक भुगतान उपलब्ध नहीं है।',
  // ---- review, 2026-10-11 — every other sentence a salon screen can show. The thirty below were the whole
  // remainder: scanned out of the tenant routes and the modules behind them, they are what an owner reading
  // Hindi still met in English. The admin portal is English by decision and is not here; neither are the
  // billing notes nobody outside Growza reads, nor the chat replies, which are not the dashboard.
  // ---- phone check-in (Jira GRW-563)
  'That time has not happened yet': 'वह समय अभी आया नहीं है',
  'Mark yourself in first.': 'पहले अपनी हाज़िरी लगाएँ।',
  'You are already marked in today.': 'आज आपकी हाज़िरी पहले ही लग चुकी है।',
  'You are already marked out today.': 'आज आपका जाना पहले ही दर्ज हो चुका है।',
  'Only a staff member marks their own day.': 'अपना दिन सिर्फ़ स्टाफ़ सदस्य ही दर्ज करता है।',
  'Your branch has not set up phone check-in yet.': 'आपकी ब्रांच में अभी फ़ोन से हाज़िरी शुरू नहीं हुई है।',
  'The owner decides attendance at this branch.': 'इस ब्रांच में हाज़िरी का फ़ैसला मालिक करते हैं।',
  'The owner has already decided today. Ask them to correct it.': 'मालिक आज का फ़ैसला कर चुके हैं। उनसे ठीक करवाने को कहें।',
  'This day has already been decided.': 'इस दिन का फ़ैसला हो चुका है।',
  // ---- bookings and the till
  'A phone number is needed so they can be reminded': 'रिमाइंडर भेजने के लिए फ़ोन नंबर चाहिए',
  'Say which chair is being taken over': 'बताएँ कि कौन सी कुर्सी ली जा रही है',
  'Say whether somebody is taking this, or nobody is': 'बताएँ कि इसे कोई ले रहा है या कोई नहीं',
  'Those services are sold at different branches. Book them separately.': 'ये सेवाएँ अलग-अलग ब्रांच में दी जाती हैं। इन्हें अलग-अलग बुक करें।',
  'This booking is already closed, so it can\'t be changed.': 'यह बुकिंग बंद हो चुकी है, इसलिए इसे बदला नहीं जा सकता।',
  'This visit is already against a client': 'यह विज़िट पहले से किसी ग्राहक के नाम है',
  'That request key was already used for another visit. Try again.': 'यह अनुरोध किसी दूसरी विज़िट के लिए पहले ही इस्तेमाल हो चुका है। फिर कोशिश करें।',
  'That amount is far more than this visit usually costs. Check it, or confirm it is right.': 'यह रकम इस विज़िट की आम कीमत से कहीं ज़्यादा है। इसे देख लें, या सही होने की पुष्टि करें।',
  'Only a finished booking can be corrected': 'सिर्फ़ पूरी हो चुकी बुकिंग ही ठीक की जा सकती है',
  'Only the owner can change a finished booking': 'पूरी हो चुकी बुकिंग सिर्फ़ मालिक बदल सकते हैं',
  'A service in a package cannot be swapped — fix its amount, or take the package off and add the service': 'पैकेज की सेवा बदली नहीं जा सकती — उसकी रकम ठीक करें, या पैकेज हटाकर सेवा जोड़ें',
  // ---- clients, menu and branches
  'A name must be 80 characters or fewer': 'नाम 80 अक्षरों से ज़्यादा का नहीं हो सकता',
  'A name must be text': 'नाम टेक्स्ट होना चाहिए',
  'That client belongs to another branch. Search for them here, or add them as a client of this branch.': 'वह ग्राहक दूसरी ब्रांच का है। उन्हें यहाँ खोजें, या इस ब्रांच के ग्राहक के तौर पर जोड़ें।',
  'That category belongs to another branch': 'वह श्रेणी दूसरी ब्रांच की है',
  'Could not find a location in that link.': 'उस लिंक में कोई जगह नहीं मिली।',
  // ---- receipts and GST invoices (Jira GRW-582)
  'That bill was not found': 'वह बिल नहीं मिला',
  'That document was not found': 'वह दस्तावेज़ नहीं मिला',
  'There is nothing on this bill to put on a document': 'इस बिल में दस्तावेज़ पर डालने के लिए कुछ नहीं है',
  'Add the client to this bill first': 'पहले इस बिल में ग्राहक जोड़ें',
  'This bill has not been paid yet. Take payment first, then make the document.': 'इस बिल का भुगतान अभी नहीं हुआ है। पहले भुगतान लें, फिर दस्तावेज़ बनाएँ।',
  'This document was cancelled, so it cannot be sent': 'यह दस्तावेज़ रद्द हो चुका है, इसलिए भेजा नहीं जा सकता',
  'A PDF cannot be made on this server yet. Open the document and use Print to save it.': 'इस सर्वर पर अभी PDF नहीं बन सकता। दस्तावेज़ खोलें और प्रिंट से सेव करें।',
  // ---- team, invites and the session
  'That number is already on this team.': 'यह नंबर पहले से इस टीम में है।',
  'This business cannot add people right now. Ask whoever invited you to contact Growza support.': 'यह बिज़नेस अभी लोग नहीं जोड़ सकता। जिसने आपको बुलाया है, उनसे Growza सपोर्ट से बात करने को कहें।',
  'This number already belongs to another business on Growza, and one account cannot be in two businesses yet. Ask whoever invited you to send an invite to a different number.': 'यह नंबर Growza पर पहले से किसी दूसरे बिज़नेस का है, और एक अकाउंट अभी दो बिज़नेस में नहीं रह सकता। जिसने आपको बुलाया है, उनसे किसी दूसरे नंबर पर न्योता भेजने को कहें।',
  'Could not reach the sign-in service. This is not a problem with your details — please try again shortly.': 'साइन इन सेवा तक नहीं पहुंच सके। यह आपकी जानकारी की गड़बड़ी नहीं है — कृपया थोड़ी देर में फिर कोशिश करें।',
  'Could not reach the sign-in service. This is not a problem with your session — please try again shortly.': 'साइन इन सेवा तक नहीं पहुंच सके। यह आपके सेशन की गड़बड़ी नहीं है — कृपया थोड़ी देर में फिर कोशिश करें।',
  'This is an impersonated support session. It can view this account but not change it.': 'यह सपोर्ट का देखने वाला सेशन है। यह इस अकाउंट को देख सकता है, बदल नहीं सकता।',
  'This is not an impersonated session.': 'यह सपोर्ट का सेशन नहीं है।',
  // ---- product returns against a sale (0127)
  'Bill not found': 'बिल नहीं मिला',
  'That product is not on this bill': 'वह सामान इस बिल में नहीं है',
  'Each product may only be listed once per return': 'एक वापसी में हर सामान एक ही बार चुना जा सकता है',
  'Pick at least one product to return': 'वापस करने के लिए कम से कम एक सामान चुनें',
  'Keep the note to 240 characters': 'नोट 240 अक्षरों तक रखें',
  'That request id was already used for a different bill': 'यह रिक्वेस्ट आईडी पहले किसी दूसरे बिल के लिए इस्तेमाल हो चुकी है',
  'Say how the refund was paid': 'बताएँ कि रिफ़ंड कैसे दिया गया',
  'Request id is too short': 'रिक्वेस्ट आईडी बहुत छोटी है',
  'Request id is too long': 'रिक्वेस्ट आईडी बहुत लंबी है',
  'Products can only be returned on the day of sale': 'सामान सिर्फ़ बिक्री के दिन ही वापस किया जा सकता है',
  // ---- Jira GRW-595 — a product's sizes (0130). The sentences that name a size travel with a `combination` field instead.
  'Set up the sizes for this product first': 'पहले इस सामान के साइज़ तय करें',
  'Name this option': 'इस विकल्प का नाम लिखें',
  'A value cannot be blank': 'कोई भी मान खाली नहीं हो सकता',
  'Add at least one value': 'कम से कम एक मान जोड़ें',
  'That is too many values': 'मान बहुत ज़्यादा हैं',
  'Send the options as a list': 'विकल्प सूची के रूप में भेजें',
  'A product can have two options at most, such as size and colour': 'एक सामान में ज़्यादा से ज़्यादा दो विकल्प हो सकते हैं, जैसे साइज़ और रंग',
  'The two options need different names': 'दोनों विकल्पों के नाम अलग-अलग होने चाहिए',
  'Each value can be listed once': 'हर मान सिर्फ़ एक बार लिखा जा सकता है',
  'Choose a value': 'एक मान चुनें',
  "That is not one of this product's values": 'यह इस सामान का मान नहीं है',
  'This product has no second option': 'इस सामान में दूसरा विकल्प नहीं है',
  'Size not found': 'साइज़ नहीं मिला',
  // Jira GRW-598 — the sizes grid, and the switch that hides it.
  'Sizes are not switched on for this business.': 'इस बिज़नेस के लिए साइज़ चालू नहीं हैं।',
  'The sizes were changed while you were editing': 'आपके बदलाव करते समय साइज़ किसी और ने बदल दिए',
  'Add at least one size': 'कम से कम एक साइज़ जोड़ें',
  'Send the sizes as a list': 'साइज़ सूची के रूप में भेजें',
  'That is too many sizes for one product': 'एक सामान के लिए साइज़ बहुत ज़्यादा हैं',
  'That size was not valid.': 'वह साइज़ सही नहीं है।',
  'That size is in the grid twice': 'यह साइज़ ग्रिड में दो बार है',
  'Stock cannot be negative': 'स्टॉक शून्य से कम नहीं हो सकता',
  // Jira GRW-597 (0132) — the count of a size.
  'Choose a size for this product': 'इस सामान का साइज़ चुनें',
  'That size is sold out or no longer on sale': 'वह साइज़ ख़त्म हो गया है या अब बिक्री में नहीं है',
  'This product has sizes, so count each size instead': 'इस सामान के साइज़ हैं, इसलिए हर साइज़ की गिनती करें',
  'Set the stock of this product to 0 first, then count each size': 'पहले इस सामान का स्टॉक 0 करें, फिर हर साइज़ की गिनती करें',
  // Jira GRW-601 — moving sizes between branches.
  'This product has sizes, so choose which sizes to move': 'इस सामान के साइज़ हैं, इसलिए चुनें कि कौन से साइज़ भेजने हैं',
  'This product has no sizes, so say how many to move': 'इस सामान के साइज़ नहीं हैं, इसलिए बताएँ कितने भेजने हैं',
  'That size is not on this product': 'यह साइज़ इस सामान का नहीं है',
  'There is not enough of that size at this branch to move that many': 'इस ब्रांच में उस साइज़ के इतने नहीं हैं कि भेजे जा सकें',
  'The other branch already has this product with different sizes. Make them match first': 'दूसरी ब्रांच में यह सामान पहले से अलग साइज़ के साथ है। पहले उन्हें एक जैसा करें',
  // Jira GRW-596 (0131) — a size's SKU and barcode.
  'Another size at this branch has that SKU': 'इस ब्रांच में किसी दूसरे साइज़ का यही SKU है',
  'Another size at this branch has that barcode': 'इस ब्रांच में किसी दूसरे साइज़ का यही बारकोड है',
  'That name is too long': 'वह नाम बहुत लंबा है',
  'That value is too long': 'वह मान बहुत लंबा है',
  'Price cannot be negative': 'क़ीमत शून्य से कम नहीं हो सकती',
  'That price is too large': 'वह क़ीमत बहुत ज़्यादा है',
  // ---- Jira GRW-658 — what Swiggy and Zomato should pay, and the commission each takes
  'Enter a percentage between 0 and 50': '0 से 50 के बीच का प्रतिशत लिखें',
  'This business takes no orders from delivery apps.': 'यह बिज़नेस डिलीवरी ऐप से ऑर्डर नहीं लेता।',
  'This business takes no orders from that app.': 'यह बिज़नेस उस ऐप से ऑर्डर नहीं लेता।',
  // ---- A bill left waiting in the POS queue for its payment. Untranslated since it was added; found once the
  // GRW-658 three above stopped masking it.
  // Jira GRW-716 — billing offline.
  'Only a paid counter order of products can be taken offline': 'बिना इंटरनेट के सिर्फ़ काउंटर का पैसे लिया हुआ सामान का ऑर्डर लिया जा सकता है',
  // Jira GRW-715 — a file that is not a menu.
  'We could not read a menu from that file. It needs a column for the dish name and one for the price.':
    'हम उस फ़ाइल से मेन्यू नहीं पढ़ पाए। उसमें डिश के नाम और दाम का कॉलम होना चाहिए।',
  'This branch already has 702 tills that bill offline.': 'इस ब्रांच में पहले से 702 काउंटर बिना इंटरनेट बिल बनाते हैं।',
  'This till was not set up for billing offline at this branch. Connect to the internet and open the till again.':
    'यह काउंटर इस ब्रांच में बिना इंटरनेट बिल के लिए तैयार नहीं था। इंटरनेट से जुड़ें और काउंटर फिर से खोलें।',
  'Only a counter product order can wait in the queue for payment':
    'कतार में पेमेंट के लिए सिर्फ़ काउंटर का प्रोडक्ट ऑर्डर रुक सकता है',
  // ---- Jira GRW-676 · GRW-678 — the 2026-11-05 functional test's fixes.
  'A package needs a price above ₹0': 'पैकेज की कीमत ₹0 से ज़्यादा होनी चाहिए',
  'Somebody has already taken payment for this booking.': 'इस बुकिंग का पेमेंट कोई पहले ही ले चुका है।',
  'This booking was cancelled, so it cannot be paid for.': 'यह बुकिंग रद्द हो चुकी है, इसलिए इसका पेमेंट नहीं लिया जा सकता।',
  'This booking was marked as not come, so it cannot be paid for.': 'इस बुकिंग पर "नहीं आए" लिखा है, इसलिए इसका पेमेंट नहीं लिया जा सकता।',
  'This booking is already closed, so it cannot be paid for.': 'यह बुकिंग पहले ही बंद हो चुकी है, इसलिए इसका पेमेंट नहीं लिया जा सकता।',
  'That product was sold in sizes. Say which size is coming back': 'यह सामान साइज़ में बिका था। बताएँ कौन सा साइज़ वापस आ रहा है',
  // ---- Jira GRW-725 — a bill taken to ₹0 is the owner's, with a reason.
  'Only the owner can give the whole bill free. Give a smaller discount, or ask the owner.':
    'पूरा बिल मुफ़्त सिर्फ़ मालिक कर सकते हैं। कम छूट दें, या मालिक से कहें।',
  'Type why the whole bill is free, in 3 to 200 letters.': 'पूरा बिल मुफ़्त क्यों है, 3 से 200 अक्षरों में लिखें।',
};

/**
 * Jira GRW-678 (RET-01) — the two sentences that carry a number and a name, so cannot be looked up whole.
 *
 * "Only 3 left of White Shirt" and "White Shirt is out of stock". The name is the shop's own word for the thing and
 * stays exactly as the shop wrote it; only the sentence around it changes language. Anchored at both ends, and the
 * name may contain anything, so a product called "Only 2 left of everything" is still read from the outside in.
 */
function localiseStockMessage(message: string): string | null {
  const few = /^Only (\d+) left of (.+)$/s.exec(message);
  if (few) return `${few[2]}: सिर्फ़ ${few[1]} बचे हैं`;
  const none = /^(.+) is out of stock$/s.exec(message);
  if (none) return `${none[1]}: स्टॉक ख़त्म है`;
  return null;
}

/** The sentence in the visitor's language when it is known; otherwise exactly what the server said. */
/**
 * Jira GRW-718 · GRW-719 — the table sentences that name a table, an area or a count. Each is one fixed shape with the
 * name or number in it, so it is matched as a shape and the name is kept as typed.
 */
const TABLE_MESSAGES: Array<[RegExp, (m: RegExpExecArray) => string]> = [
  [/^(.+) has an open bill\. Settle it first\.$/s, (m) => `${m[1]} का बिल अभी खुला है। पहले उसे निपटाएँ।`],
  [/^(.+) is already used at this branch\.$/s, (m) => `${m[1]} इस ब्रांच में पहले से है।`],
  [/^(.+) still has (\d+) tables?\. Move or remove them first\.$/s, (m) => `${m[1]} में अभी ${m[2]} टेबल हैं। पहले उन्हें हटाएँ या दूसरे एरिया में ले जाएँ।`],
  [/^(\d+) tables? still ha(?:s|ve) (?:an )?open bills?\. Settle them before switching Table orders off\.$/s, (m) => `${m[1]} टेबल का बिल अभी खुला है। टेबल ऑर्डर बंद करने से पहले उन्हें निपटाएँ।`],
  [/^A branch can have at most (\d+) tables\.$/s, (m) => `एक ब्रांच में ज़्यादा से ज़्यादा ${m[1]} टेबल हो सकती हैं।`],
  // Jira GRW-712 — a choice group's own words ("Pick one Spice").
  [/^Pick one (.+)$/s, (m) => `${m[1]} में से एक चुनें`],
  [/^Pick at most (\d+) in (.+)$/s, (m) => `${m[2]} में से ज़्यादा से ज़्यादा ${m[1]} चुनें`],
  [/^Pick at least (\d+) in (.+)$/s, (m) => `${m[2]} में से कम से कम ${m[1]} चुनें`],
  // Jira GRW-722 — moving a party and joining two tables.
  [/^(.+) has no open bill\.$/s, (m) => `${m[1]} पर कोई खुला बिल नहीं है।`],
  [/^(.+) already has guests\. Join the two tables instead\.$/s, (m) => `${m[1]} पर पहले से मेहमान हैं। दोनों टेबल जोड़ दें।`],
  [/^(.+) has no open bill\. Move the guests there instead\.$/s, (m) => `${m[1]} पर कोई खुला बिल नहीं है। मेहमानों को वहाँ ले जाएँ।`],
  [/^(.+) has a payment — settle it first\.$/s, (m) => `${m[1]} पर पैसे लिए जा चुके हैं — पहले बिल पूरा करें।`],
];

function localiseTableMessage(message: string): string | null {
  for (const [shape, say] of TABLE_MESSAGES) {
    const m = shape.exec(message);
    if (m) return say(m);
  }
  return null;
}

export function localiseApiMessage(message: string, lang: string): string {
  if (lang !== 'hi') return message;
  const known = API_MESSAGES_HI[message];
  if (known) return known;
  const stock = localiseStockMessage(message);
  if (stock) return stock;
  const table = localiseTableMessage(message);
  if (table) return table;
  // "Row 12: An HSN code is 4 to 8 digits" — a spreadsheet import names the row, then says why. The "why" is one of the
  // sentences above, so it is translated on its own and the row keeps its number.
  const row = /^Row (\d+): (.+)$/s.exec(message);
  return row ? `पंक्ति ${row[1]}: ${API_MESSAGES_HI[row[2]!] ?? row[2]}` : message;
}

/**
 * Jira GRW-478 — the guard's bare refusals, which carry a code and no sentence (BR-03: it does not say why a token
 * failed). A screen showed the code itself — "forbidden", "unauthorized". These are the dashboard's own words for
 * them, not server sentences, so they live apart from `API_MESSAGES_HI` and its "key must exist in src/" guard.
 */
const BARE_REFUSALS: Record<string, { en: string; hi: string }> = {
  forbidden: { en: 'You do not have access to this.', hi: 'आपको इसकी अनुमति नहीं है।' },
  unauthorized: { en: 'You have been signed out. Please sign in again.', hi: 'आप साइन आउट हो गए हैं। कृपया फिर से साइन इन करें।' },
};

export function bareRefusalMessage(code: string, lang: string): string | null {
  const words = BARE_REFUSALS[code];
  return words ? (lang === 'hi' ? words.hi : words.en) : null;
}

/**
 * What an owner is told when a request failed and the response carried no sentence at all — a proxy's 502, a
 * dropped connection's empty body. It used to be the request path and status (`/api/v1/… failed: 502`), which is
 * for a developer and was shown in the owner's own sheet. The status stays on `ApiError.status` for whoever
 * needs to branch on it.
 */
export function genericFailureMessage(lang: string): string {
  return lang === 'hi' ? 'कुछ गड़बड़ हो गई। कृपया फिर से कोशिश करें।' : 'Something went wrong. Please try again.';
}
