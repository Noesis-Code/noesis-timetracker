/* Textes légaux en anglais (10 oct. 2026).
 *
 * Quand la langue du profil est l'anglais (NoesisI18n.getLang() === 'en'),
 * les documents légaux affichés dans l'app (Conditions d'utilisation,
 * Politique de confidentialité, Mentions légales, Gouvernance, avis IA,
 * invitation marketing, consentements d'inscription et de Réglages) passent
 * à leur traduction anglaise. Le français d'origine est mémorisé au
 * chargement et restauré si la langue redevient 'fr'. Aucun changement de
 * fond : traduction fidèle de public/index.html. Chargé AVANT app.js, après
 * que tout le DOM concerné est analysé.
 */
(function () {
  'use strict';

  var EN = {};

  /* ------------------------------------------------------------------
   * Conditions d'utilisation V1.2
   * ---------------------------------------------------------------- */
  EN.legalTermsModal = {
    title: 'Terms of Use',
    body:
'<p class="hint">Version 1.2 — in effect on October 10, 2026.</p>\n' +
'\n' +
'<h3>1. Purpose and acceptance</h3>\n' +
'<p>These General Terms of Use (the “Terms”) govern access to and use of the Noèsis TimeTracker application and related services (the “Services”), published by Noèsis Inc. (the “Company”). By creating an account or using the Services, the User acknowledges having read, understood and accepted these Terms.</p>\n' +
'<p>The Services are offered to persons residing in Canada. They are not offered to, or promoted to, residents of other jurisdictions; by creating an Account, the User declares that they reside in Canada.</p>\n' +
'<p>The provisions of this document specific to Users residing in France or the European Union (articles 7 and 12) are drafted in anticipation of a future expansion of the Services beyond Canada; they are not operative for as long as the Services remain offered exclusively to residents of Canada.</p>\n' +
'\n' +
'<h3>2. Identification of the Company</h3>\n' +
'<p>Noèsis Inc. (legal name: Compagnie Noèsis inc.) is a business corporation incorporated in Québec on September 8, 2026, registered under Québec enterprise number (NEQ) 1182542432.</p>\n' +
'<p>These Terms bind the Company itself. Its founders, directors and officers are not personally parties to them and cannot be held personally liable for the obligations described herein.</p>\n' +
'<p>For any question regarding these Terms: compagnie.noesis@gmail.com.</p>\n' +
'\n' +
'<h3>3. Definitions</h3>\n' +
'<p>“Services”: all the features offered by Noèsis TimeTracker, including the Free Offer (and, once built and launched, Offer 1 — see article 4.2).</p>\n' +
'<p>“Account”: the personal space created by the User to access the Services; one Account corresponds to a single responsible person.</p>\n' +
'<p>“User”: any individual or business/organization holding an Account.</p>\n' +
'<p>“Content”: any data, information or message transmitted by the User in connection with the Services, including in the Community.</p>\n' +
'<p>“Subscription”: paid access to Offer 1, once it has been launched.</p>\n' +
'\n' +
'<h3>4. Description of the Services</h3>\n' +
'<p><strong>4.1 Free Offer.</strong> The Free Offer includes time tracking (TimeTracker), with a breakdown of activity by day, week, month and year, organization into sub-projects, statistics, as well as access to the Community (polls, posts, subscriptions between users) and to the optional calendar. The Free Offer also includes an artificial intelligence assistant that proposes a classification of tasks (see the Privacy Policy). The assistant’s proposals may be inaccurate, incomplete or misleading: the User must verify them before relying on them. It is the only offer active at the September 11, 2026 launch.</p>\n' +
'<p><strong>4.2 Offer 1 (paid) — not applicable at the September 11, 2026 launch.</strong> This section describes an offer that does not yet exist in the application. It is kept here in anticipation and will become operative only on the day Offer 1 is actually built and launched — not before. Offer 1 would give access to identification forms and to the analysis generated from those forms, including a roadmap automatically regenerated every six months. It would be subscribed to per activity. Envisaged price: $20 per month per activity.</p>\n' +
'\n' +
'<h3>5. Account creation and management</h3>\n' +
'<p>The User warrants the accuracy of the information provided when creating the Account and undertakes to keep it up to date. An Account is strictly personal; it may not be shared among several people, even within the same business or organization.</p>\n' +
'<p>Access to the Services is reserved for persons aged 16 or older. The Company may suspend or terminate any Account created by a person who has not reached that age.</p>\n' +
'<p>The parental consent mechanism for a minor aged 16-17, described below, applies only to the subscription to Offer 1 — not relevant for as long as it does not exist.</p>\n' +
'<p>A paid subscription to Offer 1, on the day it exists, would constitute a recurring financial commitment exceeding the ordinary and usual needs of a minor within the meaning of article 157 of the Civil Code of Québec. Subscribing to Offer 1 would then be reserved for adults (18 or older) or, for a minor aged 16 or 17, subject to the express consent of their legal representative, obtained at the time of subscription by means of a separate checkbox.</p>\n' +
'<p>The login screen makes it possible to find an existing Account by typing at least 3 characters of a name: the full first and last names of the matching persons (up to 5 results) are then displayed before any login, and the number of possible searches is limited. The User consents to this by a separate checkbox, ticked at sign-up. The details of this feature are set out in the privacy policy (section 4.1).</p>\n' +
'\n' +
'<h3>6. Prices, billing and taxes — not applicable for as long as Offer 1 does not exist</h3>\n' +
'<p>Subscription fees for Offer 1, on the day it exists, would be billed before the start of each month of service, via Stripe. In the event of a payment failure, access to Offer 1 could be suspended until the situation is regularized.</p>\n' +
'<p>The Company is not registered for the GST and QST, its taxable revenues being below the $30,000 threshold applicable to small suppliers. If the Company becomes subject to these taxes, the displayed price will be adjusted accordingly and the User will be notified in accordance with article 8.</p>\n' +
'\n' +
'<h3>7. Right of cancellation of the contract</h3>\n' +
'<p><strong>Users residing in Canada.</strong> In accordance with sections 54.1 and following of the Consumer Protection Act (distance contracts), the consumer User has a right of cancellation if the Company fails to comply with its pre-contractual disclosure obligations or its obligation to provide a copy of the contract. This section becomes relevant only on the day a paid contract (Offer 1) exists.</p>\n' +
'<p><strong>Users residing in France or the European Union (in anticipation, not operative).</strong> In accordance with article L221-18 of the French Consumer Code, the consumer User residing in France or the European Union would have a fourteen (14)-day withdrawal period from the subscription to Offer 1, without having to give a reason. Not relevant for as long as the service remains limited to Canada and free of charge.</p>\n' +
'\n' +
'<h3>8. Amendment of these Terms</h3>\n' +
'<p>The Company may amend these Terms for a legitimate reason, in particular a change in the Services, in the applicable regulations or in its operating costs; it may not do so on a purely discretionary basis. The elements of these Terms that may be amended in this way are: the description and features of the Services (article 4), the price and terms of Offer 1 once it exists (articles 4.2 and 6), the moderation rules of the Community (article 10), and the technical measures described in article 12, such as backups.</p>\n' +
'<p>Any substantial amendment will be communicated to the User by an individual email sent to the Account address, at least 30 days before it takes effect, in accordance with section 11.2 of the Consumer Protection Act. This email describes the new clause and the one it replaces, states the effective date and reminds the User that a User who refuses a substantial amendment may terminate their Account free of charge before that date.</p>\n' +
'\n' +
'<h3>9. Intellectual property</h3>\n' +
'<p>The Noèsis TimeTracker application, its structure, its features and its editorial content remain the exclusive property of the Company.</p>\n' +
'\n' +
'<h3>10. User content and Community</h3>\n' +
'<p>The Community allows the User to exchange private messages, visible only to their recipient, and public messages, visible only to other subscribers, and to publish polls. The User remains solely responsible for the Content they publish and warrants that it does not violate any applicable law or the rights of any third party.</p>\n' +
'<p>By publishing Content in connection with the Services, the User grants the Company a non-exclusive, royalty-free, worldwide licence to host, reproduce, display and transmit this Content solely to the extent necessary for the operation of the Services, in particular its display to the relevant recipients or subscribers. This licence ends when the Content is deleted, subject to copies retained for backup or legal compliance purposes.</p>\n' +
'<p>The Company applies proactive moderation of the public messages in the Community, without necessarily waiting for a report. This reading, carried out manually by an officer of the Company, is solely intended to detect Content contrary to these Terms or to the law; it involves no assessment of the opinion, value or quality of the Content, and the Company does not select, rank or highlight any Content according to its interest or point of view. Content so detected may be removed and its author’s Account suspended.</p>\n' +
'<p>Private messages exchanged between Users are not subject to any proactive monitoring or reading by the Company. They are examined only following a report, sent by email to compagnie.noesis@gmail.com or by any other reporting means made available in the application.</p>\n' +
'<p>With respect to the Content published by its Users, the Company acts as a host. Its liability for such Content can be engaged only if, having been informed by a sufficiently precise report of its unlawful nature, it fails to act promptly to remove it or block access to it.</p>\n' +
'\n' +
'<h3>11. No holding of third-party funds</h3>\n' +
'<p>The Company provides coaching services and software tools; it does not at any time hold, manage or keep funds on behalf of third parties.</p>\n' +
'\n' +
'<h3>12. Limitation of liability</h3>\n' +
'<p><strong>Users residing in Canada.</strong> Subject to article 1474 of the Civil Code of Québec, which prohibits excluding or limiting liability for material injury caused by intentional or gross fault, or for bodily or moral injury, the Company’s liability towards the User is limited to direct and foreseeable damages resulting from a breach by the Company of its essential obligations.</p>\n' +
'<p>The Company disclaims all liability for indirect damages, including loss of profits, clientele, data or business opportunities, except in the event of its intentional or gross fault.</p>\n' +
'<p>On backups: an encrypted copy of the database is created every day and kept for 30 days with a provider separate from the host (see the privacy policy, section 4.2). The Company makes reasonable efforts to avoid data loss, without guaranteeing the total absence of loss. The User remains responsible for keeping their own copies of the data they consider essential.</p>\n' +
'<p>Subject to the first paragraph of this article (intentional or gross fault, bodily or moral injury, which are never capped), and for as long as the Services remain free, the Company’s liability towards a User can practically not give rise to a monetary cap, since no amount is paid by the User. On the day Offer 1 exists, the Company’s total liability towards a User, for all claims relating to a twelve (12)-month period, may not exceed the amount paid by that User to the Company during that same period.</p>\n' +
'<p>This clause in no way deprives the consumer User of the rights granted to them by the Consumer Protection Act (Québec) or by any other applicable public order legislation.</p>\n' +
'<p><strong>Users residing in France or the European Union (in anticipation, not operative).</strong> No clause hereof shall remove or reduce the right to compensation of a User residing in France or the European Union in the event of a breach by the Company of any of its obligations.</p>\n' +
'\n' +
'<h3>13. Termination</h3>\n' +
'<p>The User may terminate their Account at any time, directly from their Account settings or by making a request to compagnie.noesis@gmail.com. The Company may suspend or terminate an Account in the event of a serious or repeated breach of these Terms, subject to prior notice except in cases of urgency.</p>\n' +
'\n' +
'<h3>14. Language of the contract</h3>\n' +
'<p>In accordance with the Charter of the French language (as amended by Law 96), the French version of these Terms is the one that prevails. Any version in another language is offered for convenience only and binds the User only if they expressly consent to it after having received the French version.</p>\n' +
'\n' +
'<h3>15. Governing law and remedies</h3>\n' +
'<p>These Terms are governed by the law applicable in the province of Québec. Subject to the consumer User’s right to bring an action before the court of their own domicile where the law allows it, any dispute falls within the jurisdiction of the competent courts of the judicial district of Montréal. No clause hereof has the effect of depriving the consumer User of their right to bring an action before the competent courts, including a class action, or of compelling them to mandatory arbitration, in accordance with section 11.1 of the Consumer Protection Act.</p>\n' +
'<p>Before any legal action, the parties undertake to attempt in good faith to resolve amicably any dispute arising from these Terms, by means of a written communication sent to compagnie.noesis@gmail.com describing the dispute, followed by a negotiation period of at least thirty (30) days. This amicable attempt in no way deprives the consumer User of their right to bring an action before the competent courts at any time, nor does it affect the limitation periods applicable to them.</p>\n' +
'\n' +
'<h3>16. Miscellaneous provisions</h3>\n' +
'<p><strong>Severability —</strong> If a provision of these Terms is held to be invalid, illegal or unenforceable, that provision is deemed severed from these Terms, without affecting the validity or enforceability of the other provisions.</p>\n' +
'<p><strong>No waiver —</strong> The Company’s failure to exercise or enforce, on a given occasion, a right or provision of these Terms does not constitute a waiver of that right or provision for the future.</p>\n' +
'<p><strong>Entire agreement —</strong> These Terms, together with the policies to which they refer (in particular the privacy policy), constitute the entire agreement between the User and the Company with respect to the Services.</p>\n' +
'<p><strong>Assignment —</strong> The Company may assign all or part of its rights and obligations under these Terms, in particular in connection with a reorganization of its business, without such assignment reducing the rights enjoyed by the consumer User under these Terms or the applicable law.</p>\n' +
'<p><strong>Force majeure —</strong> The Company cannot be held liable for a delay or failure in performance resulting from a cause beyond its reasonable control, in particular a failure of a hosting provider, a natural disaster or a government decision.</p>\n' +
'\n' +
'<h3>17. Contact details</h3>\n' +
'<p>For any question regarding these Terms: compagnie.noesis@gmail.com.</p>\n'
  };

  /* ------------------------------------------------------------------
   * Politique de confidentialité V3.7
   * ---------------------------------------------------------------- */
  EN.privacyPolicyModal = {
    title: 'Privacy Policy',
    body:
'<p class="hint">Version 3.7 — in effect on October 10, 2026.</p>\n' +
'\n' +
'<h3>Who this service is for</h3>\n' +
'<p>Noèsis TimeTracker is offered to persons residing in Canada. The service is not offered to, or promoted to, residents of the European Union or of other jurisdictions. If you are not in Canada, this service is not intended for you.</p>\n' +
'\n' +
'<h3>In brief</h3>\n' +
'<p>Noèsis TimeTracker is an application that lets you time your activities and track their totals. To work, it needs to know who you are and to keep what you time.</p>\n' +
'<p>We collect the minimum: your name, your telephone number, an email address, and what you yourself record in the application. We do not resell any of your information and we do not disclose it to any advertiser. If you consent by a separate checkbox, Noèsis may use it to analyze usage, write to you for commercial purposes and target its own campaigns (section 2.4), and keep a copy of it on an encrypted storage medium held by Noèsis (section 4.7). There are no advertising trackers in the application. Your first and last name can be seen even before login: typing at least 3 characters of a name on the login screen is enough to display up to 5 full identities, and the number of possible searches is limited. You consent to this by a separate checkbox, ticked at sign-up. Once logged in to their own account, any other registered member can also see your profile photo, the number of projects you follow and what you are looking for (if you state it): this is the application’s basic directory function. Everything else — your activities, your totals, your notes — is private by default. Nothing is visible to others until you decide so. Your telephone number and email address are never visible by default: you can choose to share one, the other, or both with your accepted subscribers, each remaining off until you turn it on yourself. To help you classify your tasks, an artificial intelligence provided by Anthropic may use what you enter in the application to organize it, but never your name, first name, email, telephone number, photo, PIN code, conversations or posts (section 4.6). You can delete your account at any time: everything is then erased. Your information is hosted in the Netherlands, with our infrastructure provider.</p>\n' +
'<p>The rest of this document details each of these points.</p>\n' +
'\n' +
'<h3>1. Who is responsible for your information</h3>\n' +
'<p>The Noèsis TimeTracker application is operated by Noèsis Inc. (legal name: Compagnie Noèsis inc., NEQ 1182542432), a business corporation incorporated in Québec, whose head office is located in Montréal, Québec.</p>\n' +
'<p>In accordance with the Act respecting the protection of personal information in the private sector (Québec), the person in charge of the protection of personal information is Émilien Morel-Obaton, Vice-President of Noèsis Inc., to whom this function has been delegated in writing — compagnie.noesis@gmail.com. For persons residing in another province or territory of Canada, the Personal Information Protection and Electronic Documents Act (PIPEDA), or the applicable provincial law, also applies.</p>\n' +
'<p>This is the address to write to for any question about this policy, to exercise your rights, or to report a problem.</p>\n' +
'\n' +
'<h3>2. What we collect, and why</h3>\n' +
'<p>We collect nothing other than what is necessary for the application to work.</p>\n' +
'<p><strong>2.1 What you give us at sign-up</strong></p>\n' +
'<p><strong>First name or pseudonym</strong> — to identify you in the application, and to name you to the people with whom you share an activity.</p>\n' +
'<p><strong>Last name</strong> — to identify you more formally, in particular in professional exchanges within a shared activity.</p>\n' +
'<p><strong>Telephone number</strong> — to reach you and to allow you to recover access to your account if other means are not enough.</p>\n' +
'<p><strong>Email address</strong> — to find your account and to help you recover access to it if you forget your PIN code.</p>\n' +
'<p><strong>PIN code (4 to 6 digits)</strong> — to protect access to your account. It is never stored in clear text: only an irreversible cryptographic fingerprint is recorded.</p>\n' +
'<p>We do not ask for your date of birth, your postal address or any payment data.</p>\n' +
'<p><strong>2.2 What you create by using the application</strong></p>\n' +
'<p><strong>Your activities</strong> — the list you create yourself, with the name and color you choose.</p>\n' +
'<p><strong>Your timed sessions</strong> — date, start time, duration. This is the purpose of the application.</p>\n' +
'<p><strong>Your notes</strong> — the free text you add to a session or a post. You alone decide what you write in it.</p>\n' +
'<p><strong>Your attachments</strong> — the files, photos or documents you choose to add.</p>\n' +
'<p><strong>Your links with other people</strong> — the activities you share, the invitations sent or received, the people you follow, and the messages exchanged in a shared activity.</p>\n' +
'<p><strong>Your public messages in the Community</strong> — published for your subscribers. An officer of Noèsis may read them to detect content contrary to the terms of use or to the law (moderation). Your private messages are read only if someone reports them.</p>\n' +
'<p><strong>Your profile photo</strong> — optional.</p>\n' +
'<p><strong>Your preferences</strong> — light or dark theme, language, colors.</p>\n' +
'<p><strong>Your calendar address</strong> — created only if you enable the calendar (section 4.3). It is a random string of characters, associated only with your account, which you can delete or replace at any time.</p>\n' +
'<p>On notes and attachments: these are free text and file spaces. We do not control their content and we do not analyze them, except through the artificial intelligence assistant described in section 4.6, which may use the information you enter in the application, including your notes and attachments, but never your identity, contact details, PIN code, conversations or posts. Avoid entering sensitive information — about your health, finances or private life — that you would not want kept.</p>\n' +
'<p><strong>2.3 What we do not use</strong></p>\n' +
'<p>No advertising or audience-measurement cookies (the application uses a single cookie, strictly necessary for its operation, which keeps you logged in from one page to another — which is why it does not require your prior consent); no third-party analytics tools, no tracking pixels, no advertising network. An artificial intelligence is used to propose the classification of your tasks and may use the information you enter in the application: see section 4.6.</p>\n' +
'<p><strong>2.4 Analysis and commercial use, with your separate consent</strong></p>\n' +
'<p>If you consent by a separate checkbox, which you tick yourself at sign-up, Noèsis may use the information you enter in the application (profile, activities, timed sessions, tasks, notes, preferences) to: analyze usage and improve the service; produce statistics; send you commercial communications; target our own advertising campaigns. Your PIN code and your private messages are excluded from this use. We do not resell, rent or transfer any of your information, and we do not disclose it to any advertiser or data broker. A copy may be kept on an encrypted storage medium held by Noèsis (section 4.7). Refusing this consent, or withdrawing it later from Settings, Security section, or by writing to us at the address in section 1, has no consequence on your access to the application. Any new commercial use would be announced before it takes effect (section 9).</p>\n' +
'\n' +
'<h3>3. On what basis we process your information</h3>\n' +
'<p>We process your information on the basis of your consent, which you give at sign-up, separately from the terms of use. This consent is free: you are not obliged to use Noèsis. It is informed: this policy explains its scope. It is given for specific purposes, listed in section 2. The display of your first and last name in the member search (section 4.1) is one of those purposes; you consent to it by a separate checkbox, ticked at sign-up. The same applies to the commercial use described in section 2.4, for which another separate checkbox is provided.</p>\n' +
'<p>You can withdraw it at any time by deleting your account (section 6). Withdrawal has no retroactive effect on what was done before, but it ends the processing for the future.</p>\n' +
'\n' +
'<h3>4. Who can see your information</h3>\n' +
'<p><strong>4.1 Other users.</strong> The login screen offers a search open to any visitor, even without a Noèsis account: as soon as at least 3 characters are typed, the full first and last names of any matching person are displayed, up to 5 results at a time. Any fragment is therefore enough to make an identity appear. The number of possible searches is limited to prevent automated scanning of the list of accounts. You consent to this display by a separate checkbox, ticked at sign-up. This search only ever shows the first and last name — neither your photo, nor your telephone number, nor your email address, nor anything else about your account appears in it.</p>\n' +
'<p>A separate technical route, not displayed in the interface, exists in parallel: it serves only so that the application automatically recognizes, on the device where you already created your account, that this account still exists, based on the first and last name already stored on that device. It remains technically accessible outside the application, without authentication, to anyone who already knows your exact first and last name, but no button or field of the application leads to it, and it does not make it possible to guess an identity one does not already know.</p>\n' +
'<p>Once logged in to their own account, any other registered user can also see, in addition to your first and last name: your profile photo, the number of projects you follow and what you are looking for (if you state it). This is the application’s basic directory function, necessary so that other people can find you: you cannot opt out of it other than by deleting your account.</p>\n' +
'<p>Your telephone number and email address, for their part, are never visible by default. You may, however, choose, in Settings → Identity, to share your email address and/or your telephone number — both, either one, independently — with the people who follow you and whose subscription request you have accepted. As long as you have not enabled this sharing for a given channel, no one other than you sees that information through that channel; if you unsubscribe from a person or they unsubscribe from you, access to that contact information disappears along with the rest of what the subscription allows.</p>\n' +
'<p>Everything else remains private by default. Your activities, your totals, your timed sessions, your notes, the detail of your projects and your posts are visible to no one else until you yourself have taken one of the following voluntary actions: (1) inviting someone to share an activity — that person then sees the name of the activity, your first name and the time you devote to it, for that activity only, never your other activities or your personal notes; (2) accepting someone’s subscription request — that person can then view your statistics (time and tasks), the detail of your projects and your posts, and, if you have enabled it, your email and/or telephone (see above); (3) writing in a shared activity discussion — your messages are read by the other members of that activity. You can reverse each of these choices at any time.</p>\n' +
'<p><strong>4.2 Our hosting provider.</strong> The application and its database are hosted with Railway Corporation, in a data center located in Amsterdam, the Netherlands. Railway is, however, a U.S. company (San Francisco, California): according to the data processing agreement concluded with it, its main processing activities take place in the United States and it may transfer information there, in particular through its own subprocessors (its infrastructure relies on Google Cloud Platform; the list of its subprocessors is public: trust.railway.com). The backup copy, for its part, does not go through Railway: it is kept with Cloudflare, as indicated below. Railway acts solely as a technical service provider: it hosts, it does not operate. It is bound by its own public terms of use and privacy policy, which impose confidentiality and security obligations on it, and it is not entitled to use your information for its own purposes. These commitments are also formalized in a written data processing agreement (DPA) signed with this host on September 10, 2026.</p>\n' +
'<p>Since this hosting is located outside Québec, we carried out a privacy impact assessment beforehand, as the law requires. You can request its summary at the address given in section 1. The Netherlands falls under the European Union’s General Data Protection Regulation, a legal framework recognized as providing a high level of protection — higher, on several points, than what Québec law requires. For processing that would take place in the United States, the protection of your information relies on the written data processing agreement signed with Railway.</p>\n' +
'<p>An encrypted backup copy now exists, in addition to the main database. Every day, a copy of your information is encrypted before leaving our servers and sent to Cloudflare, in a data center located in the European Union. Cloudflare only ever receives unreadable bytes: the decryption key is never transmitted to that company.</p>\n' +
'<p><strong>4.3 Your calendar application, if you enable it.</strong> Noèsis can make the due dates of your sub-projects appear in a calendar application — for example Apple Calendar or Google Calendar. This feature is off by default. Nothing leaves the application until you have enabled it yourself, in Profile → Settings → Calendar.</p>\n' +
'<p>When you enable it: the application gives you a unique web address, containing a random string of characters, which you give to your calendar application — it is your calendar that comes to fetch the information, Noèsis sends nothing anywhere. If you use Google Calendar, it is Google’s servers that come to re-read this address; if you use Apple Calendar, it is Apple’s or directly your device. These companies then receive what the address contains, and keep it according to their own policies, over which we have no control. What the address contains, and nothing else: the name of the sub-project, the name of the activity to which it belongs, and the due date — no task, no message, no poll, no member name, no timed duration, no profile data. The link goes in one direction only: what you modify in your calendar never changes anything in Noèsis.</p>\n' +
'<p>This address must be treated like a password. Anyone who obtains it can read the names of your sub-projects and their dates, without having to log in. Do not publish it anywhere.</p>\n' +
'<p>You stay in control at all times, from Profile → Settings → Calendar: regenerate the address, disable the calendar, or delete your account (the address is then destroyed along with the rest).</p>\n' +
'<p><strong>4.4 No one else.</strong> We do not sell your information. We do not rent it. We do not disclose it to any advertiser, data broker or commercial partner. We would disclose it to a public authority only if the law required us to, and we would inform you to the extent the law allows.</p>\n' +
'<p><strong>4.5 Our email-sending service, if you use “Help &amp; suggestions”.</strong> The “Help &amp; suggestions” form in the Settings panel lets you send a free-form message to the Noèsis team, with up to two optional attachments (photo or document, without distinction between the two). This message — accompanied by your first name (or pseudonym) already associated with your profile — is transmitted by email, using Resend, a U.S. email-sending subprocessor, to compagnie.noesis@gmail.com, a Gmail inbox (a Google service): the message is therefore also kept in that inbox. This transfer to the United States is governed by a written data processing agreement (DPA) signed with Resend, which imposes confidentiality and security obligations on it. Resend keeps the content of this email and the sending logs for as long as our account remains active there, and deletes them no later than 90 days after its closure. As with notes (section 2.2), avoid entering sensitive information that you would not want to pass through this channel, nor be kept, even temporarily, by these subprocessors.</p>\n' +
'<p><strong>4.6 Our artificial intelligence assistant, provided by Anthropic.</strong> In the Free Offer, when you create a task in an activity, an artificial intelligence provided by Anthropic, a U.S. subprocessor, proposes a pole and a section in which to file it. You keep the final decision: the first time you use this feature, you choose the mode you prefer, and you can change it at any time in Settings (AI management section), where three options are offered: Partial (the proposal is presented to you in a window that you must validate before it applies), Autonomous (the classification applies directly, without validation from you; you can then move the task yourself) or Off (no suggestion, you classify your tasks yourself). You can ask us what information was used to propose a classification and why, at the address in section 1.</p>\n' +
'<p>In Offer 1 (paid), which does not yet exist in the application, if you choose to fill in the forms provided for that purpose, the data you enter in them — time devoted to your activities per week, most productive days, tasks already noted — will be transmitted to Anthropic to automatically generate a daily roadmap, which will adapt each week to your availability of the previous week. A notification, accompanied by a window presenting the tasks proposed for the day, will be sent to you every day.</p>\n' +
'<p>What may be transmitted to Anthropic: what you enter in the application to organize it, namely your activities, your poles and sections, your timed sessions, your tasks, your notes, your attachments, your preferences and, on the day Offer 1 exists, your answers to the forms used for the roadmap. Never transmitted: your first name, your last name, your telephone number, your email address, your photo, your PIN code (we keep only an encrypted version of it), your conversations (private messages and activity discussions) and your posts in the Community. In the current task classification, the assistant receives the text of the task and the names of the poles and sectors of the activity. This information may be used by the assistant now or in new features; before a new feature uses your information for a new purpose, we inform you by email and in the application (section 9). Anthropic may process this information anywhere in the world, under the data processing contract concluded with us (Anthropic’s commercial terms and data processing addendum). Anthropic uses subprocessors whose up-to-date list is public: anthropic.com/subprocessors. According to Anthropic’s commercial terms, it may not use content transmitted through the API to train its models. At the end of the contract with Anthropic, this information is deleted from its systems within 30 days, except in the case of a legal obligation, a dispute between the parties or the need to combat harmful use of the service. During the contract, Anthropic automatically deletes from its servers the information transmitted and the assistant’s responses within 30 days of their receipt or generation; content flagged by its systems as contrary to its usage policy may be kept for up to 2 years. The assistant’s proposals may be inaccurate, incomplete or misleading: verify them before accepting them.</p>\n' +
'<p><strong>4.7 Our encrypted storage medium, if you have consented to the use in section 2.4.</strong> The relevant information may be copied, to be analyzed, onto an encrypted storage medium held by Noèsis (computer or removable medium), without going through a third-party service. Only the officers of Noèsis Inc. have access to it. We place neither your PIN code nor your private messages on it. If you withdraw your consent or delete your account, we delete from this medium the copy that concerns you.</p>\n' +
'\n' +
'<h3>5. How long we keep it</h3>\n' +
'<p>As long as your account exists, your information is kept — this is what allows you to consult your history. This includes your completed tasks, which are kept with your account (locked after 7 days) until its deletion.</p>\n' +
'<p>As soon as you delete your account, everything is immediately and permanently erased from the live database: your profile, your activities, your history, your notes, your attachments, your messages, your links with other people and your calendar address. There is no grace period and no trash: deletion is irreversible.</p>\n' +
'<p>The only exception: encrypted backups. An encrypted copy of the database is kept off-site to protect us from accidental loss. A copy of your information, already encrypted, may therefore remain for up to 30 days in these backups before being permanently purged by automatic rotation, even after your account is deleted. No one can read this copy without the decryption key, which is never transmitted to our backup provider. If you have consented to the use in section 2.4, the copy kept on our encrypted medium (section 4.7) is deleted as soon as you withdraw your consent or delete your account.</p>\n' +
'<p>If you simply stop using the application without deleting your account, your information remains kept for 24 months without login. After that period, we write to you at your account’s email address at least 30 days before closing it; if you do not log in again by then, the account is deleted as described above. You can also write to us at any time so that we close an inactive account earlier.</p>\n' +
'\n' +
'<h3>6. Your rights</h3>\n' +
'<p>You may, at any time:</p>\n' +
'<p><strong>Access your information</strong> — it is visible in the application. You may also request a copy of it.</p>\n' +
'<p><strong>Correct it</strong> — directly in the Profile tab, or by writing to us.</p>\n' +
'<p><strong>Take it with you (portability)</strong> — from Profile → Settings → “Export my data”, a button directly hands you a structured file containing everything that concerns you.</p>\n' +
'<p><strong>Have it erased</strong> — the “Delete my account” button in the Profile tab. Immediate effect, subject to section 5.</p>\n' +
'<p><strong>Withdraw your consent</strong> — by deleting your account. For the commercial use alone (section 2.4), it is enough to turn off the switch provided in Settings, Security section. For the calendar alone, it is enough to disable it (section 4.3).</p>\n' +
'<p><strong>File a complaint</strong> — with the Commission d’accès à l’information du Québec or, if you reside in another province or territory of Canada, with the Office of the Privacy Commissioner of Canada.</p>\n' +
'<p>We respond to any request within a maximum of 30 days. If we had to refuse a request, we would give you the reason in writing and indicate the available remedies.</p>\n' +
'<p><strong>6bis. Audit of the actual erasure of the account (“Delete my account”).</strong> When your account is deleted, the following are actually erased (database row deleted, not merely hidden): your profile (identity, last name, telephone, email, hashed PIN code), your history and your running timer, your memberships in activities, as well as — by cascade — your invitations, your subscriptions, your attachments, your messages, your posts and profile projects, your notification subscriptions, your poll votes, your calendar address. Your attachments exist nowhere other than in these database rows: their deletion is therefore complete, with no residue on a separate storage service.</p>\n' +
'<p>What legitimately remains, by construction: a shared activity of which other people remain members continues to exist, with its ownership automatically transferred to the oldest remaining member; the timed sessions and messages of the other members of a shared activity remain unchanged — only yours are removed; a sub-project, a task section or a poll that you created within a shared activity survives the deletion of your account, with its authorship transferred in the same way, rather than causing the content and votes of the other members to disappear. Where a transfer of authorship is not possible (a poll published on your personal page, or a message you wrote in a sub-project’s thread), the content is kept and only your name disappears, displayed as “Deleted account”.</p>\n' +
'\n' +
'<h3>7. How we protect your information</h3>\n' +
'<p><strong>Encryption in transit</strong>. All communications between your device and the application go through HTTPS.</p>\n' +
'<p><strong>Irreversible PIN codes</strong>. Your PIN code (4 to 6 digits) is transformed by a salted cryptographic function (scrypt); even we cannot read it.</p>\n' +
'<p><strong>Account partitioning</strong>. The server verifies your identity on every request from a signed session. It is not possible to access another account’s information by modifying an address.</p>\n' +
'<p><strong>Confidentiality by default</strong>. All visibility settings are at maximum protection when the account is created, with the exception of your minimal identity (section 4.1): your first and last name can be found before login through a limited search (section 4.1), and by any other registered member once logged in. Your photo, the number of projects you follow and what you are looking for are visible to logged-in members. The sharing of your email and telephone, for their part, like the rest and the features that communicate something to the outside, such as the calendar in section 4.3, remain off until you enable them.</p>\n' +
'<p><strong>Unpredictable and revocable calendar addresses</strong>. The address described in section 4.3 is drawn at random over 256 bits, which makes it impossible to guess, and you can replace or delete it at any time.</p>\n' +
'<p><strong>Restricted access</strong>. Only the officers of Noèsis Inc., Gaspard and Émilien Morel-Obaton, have access to the infrastructure.</p>\n' +
'<p><strong>No system is perfectly secure</strong>. In the event of an incident presenting a risk of serious injury, we will inform the Commission d’accès à l’information and the persons affected, as the law requires. For persons residing outside Québec, we will likewise inform the Office of the Privacy Commissioner of Canada where there is a real risk of significant harm. We record all incidents in a register.</p>\n' +
'\n' +
'<h3>8. Minors</h3>\n' +
'<p>Noèsis TimeTracker is not intended for persons under 16.</p>\n' +
'<p>A paid offer is planned for the future with additional age and parental consent conditions — see the terms of use. It does not yet exist in the application at the time of publication of this policy.</p>\n' +
'\n' +
'<h3>9. If this policy changes</h3>\n' +
'<p>We may amend this policy, for example if the application evolves. Any significant change will be communicated to you by email and flagged in the application before it takes effect, and the version date at the top of this document will be updated. The version history is kept and can be provided to you on request.</p>\n' +
'\n' +
'<h3>10. Contact us</h3>\n' +
'<p>For any question, request or complaint regarding your personal information:</p>\n' +
'<p>Émilien Morel-Obaton, Vice-President of Noèsis Inc. — Person in charge of the protection of personal information</p>\n' +
'<p>compagnie.noesis@gmail.com</p>\n' +
'<p>You may also contact the Commission d’accès à l’information du Québec directly — cai.gouv.qc.ca — or, if you reside outside Québec, the Office of the Privacy Commissioner of Canada — priv.gc.ca.</p>\n'
  };

  /* ------------------------------------------------------------------
   * Mentions légales V1.2
   * ---------------------------------------------------------------- */
  EN.legalNoticesModal = {
    title: 'Legal Notices',
    body:
'<p class="hint">Version 1.2 — in effect on October 10, 2026.</p>\n' +
'\n' +
'<h3>Identification of the operator</h3>\n' +
'<p>The Noèsis TimeTracker application is operated by <strong>Noèsis Inc.</strong> (legal name: Compagnie Noèsis inc.), a business corporation incorporated in Québec on September 8, 2026, whose head office is located in Montréal, Québec, Canada.</p>\n' +
'<p>Québec enterprise number (NEQ): <strong>1182542432</strong>.</p>\n' +
'<p>Noèsis Inc. is a business corporation incorporated in Québec. The founders, Gaspard and Émilien Morel-Obaton, are its officers and shareholders and no longer personally assume, in an individual capacity, the responsibilities relating to the application.</p>\n' +
'<p>Contact: compagnie.noesis@gmail.com</p>\n' +
'\n' +
'<h3>Person in charge of the protection of personal information</h3>\n' +
'<p>In accordance with section 3.1 of the <em>Act respecting the protection of personal information in the private sector</em>, the person in charge of the protection of personal information is <strong>Émilien Morel-Obaton</strong>, Vice-President of Noèsis Inc., to whom this function has been delegated in writing — compagnie.noesis@gmail.com.</p>\n' +
'<p>This person is responsible for ensuring compliance with the law, responding to requests for access, rectification and deletion, and handling confidentiality incidents.</p>\n' +
'\n' +
'<h3>Hosting</h3>\n' +
'<p>The application is hosted by <strong>Railway Corporation</strong>, in a data center located in Amsterdam, the Netherlands.</p>\n' +
'\n' +
'<h3>Language</h3>\n' +
'<p>This application and its contractual documents are offered in French.</p>\n'
  };

  /* ------------------------------------------------------------------
   * Gouvernance
   * ---------------------------------------------------------------- */
  EN.governanceModal = {
    title: 'Governance of personal information',
    body:
'<p>Noèsis collects the minimum of information, does not sell it, hosts it with contractually bound providers and lets you view, correct or delete it. To reach the person in charge of the protection of personal information, make a request or file a complaint, write to compagnie.noesis@gmail.com. We aim to respond within 15 days; the law gives us 30 days. If you are not satisfied with the response, you may contact the Commission d’accès à l’information du Québec.</p>\n' +
'<p class="hint">Last updated: October 10, 2026</p>\n'
  };

  var DOC_IDS = ['legalTermsModal', 'privacyPolicyModal', 'legalNoticesModal', 'governanceModal'];

  /* ------------------------------------------------------------------
   * Éléments dont on remplace les nœuds de texte un par un (pour
   * conserver les liens et leurs écouteurs). Chaque entrée : sélecteur
   * (premier élément), puis la liste des textes dans l'ordre du DOM.
   * ---------------------------------------------------------------- */
  var NODE_ITEMS = [
    // Inscription
    { pick: 'label[for="onbLegalTermsCheckbox"]',
      en: ['I have read and I accept the ', 'terms of use', ' and the ', 'privacy policy', ', and I am 16 years of age or older.'] },
    { pick: 'label[for="onbMarketingCheckbox"]', en: ['Commercial use of my data'] },
    { pick: '.onbConsentRow:nth-child(1) .onbLegalText',
      en: ['I agree that Noesis may use the data I enter to analyze usage, produce statistics, send me commercial communications and target its own advertising campaigns. My PIN code and my private messages are never used. I can withdraw my consent at any time in Settings, Security section. (Privacy Policy, ', '§2.4', ')'] },
    { pick: 'label[for="onbDirectoryCheckbox"]', en: ['Be findable at login'] },
    { pick: '.onbConsentRow:nth-child(2) .onbLegalText',
      en: ['I agree that my first and last name may be found in the member search on the login screen. (Privacy Policy, section 4.1)'] },
    // Réglages > Sécurité
    { pick: '.settingsConsentCard .consentItem .notifRowLabel', en: ['Commercial use of my data'] },
    { pick: '.settingsConsentCard .consentItem .hint',
      en: ['Usage analysis, statistics, commercial communications and advertising campaigns by Noesis. ', '§2.4'] },
    { pick: '.settingsConsentCard > .notifRow .notifRowLabel', en: ['Be findable in the login screen search'] },
    { pick: '#openPrivacyPolicyBtn', en: ['Read the privacy policy'] },
    { pick: '#openLegalNoticesBtn', en: ['Read the legal notices'] },
    { pick: '#openLegalTermsBtn', en: ['Read the terms of use'] },
    { pick: '#openPrivacyPolicyBtn', parentHint: true,
      en: ['How Noèsis TimeTracker works, what it does with your information, and the rules for using the service.'] },
    // Invitation marketing
    { pick: '#marketingInviteModal .sectionTitle', en: ['A question about your data'] },
    { pick: '#marketingInviteModal .marketingInviteBody',
      en: ['We would like to use the data you enter to analyze usage, produce statistics, send you commercial communications and target our own advertising campaigns. Your PIN code and your private messages are never used. You can change your mind at any time in Settings, Security section. (Privacy Policy, ', '§2.4', ')'] },
    { pick: '#marketingInviteYes', en: ['I agree'] },
    { pick: '#marketingInviteNo', en: ['No thanks'] },
    // Avis IA
    { pick: '#aiNoticeModal .sectionTitle', en: ['How Noèsis uses your information'] },
    { pick: '#aiNoticeModal .aiNoticeBody',
      en: [
        'To help you organize your tasks, the Roadmap relies on Noèsis, which uses an artificial intelligence provided by Anthropic, a U.S. company that acts as a subprocessor of Noèsis.',
        'What may be transmitted to Anthropic:',
        ' what you enter in the Roadmap, that is, the text of your tasks and goals, the names and descriptions of your poles and sectors, and, depending on the features, your notes, your attachments and the time you have recorded. If an activity is shared, the classification corrections made by its members may also be used.',
        'What is never transmitted:',
        ' your first name, your last name, your email, your telephone number, your photo, your PIN code, your private messages, your activity discussions and your posts in the Community.',
        'Avoid writing sensitive information (health, finances, private life) in your tasks, notes and attachments if you do not want it to be transmitted.',
        'Anthropic may process this information anywhere in the world, under the data processing contract concluded with Noèsis. It may not use it to train its models. It deletes it from its servers within 30 days. The list of its subprocessors is public: anthropic.com/subprocessors. Noèsis’s proposals may be inaccurate: verify them.',
        'You keep the decision. In Settings, AI management tab, you can change or turn off Noèsis’s help at any time: “Autonomous”, “Partial” or “Off” (no data transmitted to Anthropic).',
        'Questions or requests about your information: compagnie.noesis@gmail.com. The details are in section 4.6 of our ', 'Privacy Policy', '.'
      ] },
    { pick: '#aiNoticeAck', en: ['I understand'] }
  ];

  function $(sel) { return document.querySelector(sel); }

  // Nœuds de texte non vides, dans l'ordre du DOM.
  function textNodes(el) {
    var out = [];
    var w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null, false);
    var n;
    while ((n = w.nextNode())) { if (n.nodeValue.trim()) out.push(n); }
    return out;
  }

  var originals = [];      // [{ el, html }] documents
  var nodeOrig = [];       // [{ node, value }]
  var nodeTargets = [];    // [{ node, en }]
  var ready = false;

  function resolveItems() {
    NODE_ITEMS.forEach(function (it) {
      var el;
      if (it.parentHint) {
        var b = $(it.pick);
        el = b ? b.parentNode.querySelector('.hint') : null;
      } else {
        el = $(it.pick);
      }
      if (!el) return;
      var nodes = textNodes(el);
      // Le « Learn more » de la 2e case partage le même sélecteur : traité à part.
      for (var i = 0; i < nodes.length && i < it.en.length; i++) {
        nodeOrig.push({ node: nodes[i], value: nodes[i].nodeValue });
        nodeTargets.push({ node: nodes[i], en: it.en[i].trim(), lead: nodes[i].nodeValue.match(/^\s*/)[0], trail: nodes[i].nodeValue.match(/\s*$/)[0] });
      }
    });
    document.querySelectorAll('.governanceLink').forEach(function (a) {
      var nodes = textNodes(a);
      if (nodes[0]) {
        nodeOrig.push({ node: nodes[0], value: nodes[0].nodeValue });
        nodeTargets.push({ node: nodes[0], en: 'Governance of personal information', lead: '', trail: '' });
      }
    });
    // Libellés « En savoir plus » (les deux menus déroulants)
    document.querySelectorAll('.onbConsentMore > summary').forEach(function (s) {
      var nodes = textNodes(s);
      if (nodes[0]) {
        nodeOrig.push({ node: nodes[0], value: nodes[0].nodeValue });
        nodeTargets.push({ node: nodes[0], en: 'Learn more', lead: '', trail: '' });
      }
    });
  }

  function snapshot() {
    DOC_IDS.forEach(function (id) {
      var modal = document.getElementById(id);
      if (!modal) return;
      var body = modal.querySelector('.legalTermsBody');
      var title = modal.querySelector('.sectionTitle');
      originals.push({ id: id, body: body, bodyHtml: body ? body.innerHTML : '', title: title, titleText: title ? title.textContent : '' });
    });
    resolveItems();
    ready = true;
  }

  // Pour l'avis IA, les <strong> contiennent un seul nœud et le <p> parent
  // plusieurs : on associe dans l'ordre DOM, donc l'ordre de EN est celui du
  // texte (étiquette en gras, puis suite du paragraphe).
  function currentLang() {
    try { return window.NoesisI18n && window.NoesisI18n.getLang ? window.NoesisI18n.getLang() : 'fr'; } catch (e) { return 'fr'; }
  }

  function apply() {
    if (!ready) return;
    {
      var en = currentLang() === 'en';
      originals.forEach(function (o) {
        if (o.body) {
          var wantHtml = en ? EN[o.id].body : o.bodyHtml;
          if (o.body.innerHTML !== wantHtml) o.body.innerHTML = wantHtml;
        }
        if (o.title) {
          var wantTitle = en ? EN[o.id].title : o.titleText;
          if (o.title.textContent !== wantTitle) o.title.textContent = wantTitle;
        }
      });
      if (en) {
        nodeTargets.forEach(function (t) {
          var v = t.lead + t.en + t.trail;
          if (t.node.nodeValue !== v) t.node.nodeValue = v;
        });
      } else {
        nodeOrig.forEach(function (o) {
          if (o.node.nodeValue !== o.value) o.node.nodeValue = o.value;
        });
      }
    }
  }

  function start() {
    snapshot();
    apply();
    // Changement de langue : l'attribut lang de <html> est posé par setLang.
    new MutationObserver(function () { apply(); }).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
    // Ouverture d'une modale légale / de consentement : on réapplique.
    var ids = DOC_IDS.concat(['aiNoticeModal', 'marketingInviteModal']);
    ids.forEach(function (id) {
      var m = document.getElementById(id);
      if (m) new MutationObserver(function () { apply(); }).observe(m, { attributes: true, attributeFilter: ['class'] });
    });
    // Après chaque passage de la traduction statique (app.js), le texte
    // anglais d'origine du dictionnaire peut avoir été posé par-dessus :
    // on réapplique quand l'app signale qu'elle est prête.
    window.addEventListener('load', function () { apply(); setTimeout(apply, 300); });
    var oldSet = window.NoesisI18n && window.NoesisI18n.translateStaticDom;
    if (oldSet) {
      window.NoesisI18n.translateStaticDom = function (root) {
        var r = oldSet.apply(this, arguments);
        apply();
        return r;
      };
    }
    window.NoesisLegalEn = { apply: apply, EN: EN };
  }

  start();
})();
