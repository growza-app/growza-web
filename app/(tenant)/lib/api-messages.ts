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
  // ---- Jira GRW-478 (U-3) — sentences added by the GRW-463 fixes
  'A name must be text, 80 characters or fewer': 'नाम 80 अक्षरों तक का टेक्स्ट होना चाहिए',
  'A note must be text, 500 characters or fewer': 'नोट 500 अक्षरों तक का टेक्स्ट होना चाहिए',
  'Choose one of your current stylists.': 'अपने मौजूदा स्टाइलिस्ट में से किसी को चुनें।',
  'Nobody who does this is free at that time. Pick another.': 'उस समय यह काम करने वाला कोई खाली नहीं है। कोई दूसरा समय चुनें।',
  'That day has already gone. Pick today or a later day.': 'वह दिन बीत चुका है। आज या आगे का कोई दिन चुनें।',
  'That time was just taken. Pick another.': 'वह समय अभी-अभी भर गया। कोई दूसरा चुनें।',
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
  'That request was not valid.': 'वह अनुरोध सही नहीं था।',
  'Something went wrong handling this request.': 'इस अनुरोध को संभालते समय कुछ गड़बड़ हो गई।',
  // ---- bookings, visits and clients
  'That slot was just taken': 'वह स्लॉट अभी-अभी भर गया',
  'That service is not available': 'वह सेवा उपलब्ध नहीं है',
  'That staff member is not available': 'वह स्टाफ़ सदस्य उपलब्ध नहीं है',
  // Owner, 2026-10-14 — the till sells products.
  'Pick at least one service or product': 'कम से कम एक सेवा या सामान चुनें',
  'That product is not on the shelf': 'वह सामान शेल्फ़ पर नहीं है',
  'That product is sold at another branch': 'वह सामान दूसरी ब्रांच में बिकता है',
  'A product by that name is already on the shelf': 'इस नाम का सामान शेल्फ़ पर पहले से है',
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
};

/** The sentence in the visitor's language when it is known; otherwise exactly what the server said. */
export function localiseApiMessage(message: string, lang: string): string {
  return lang === 'hi' ? (API_MESSAGES_HI[message] ?? message) : message;
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
