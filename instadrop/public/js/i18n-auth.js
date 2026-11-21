/* Translations for sign in, sign up and account screens. Same rules as i18n.js: missing keys fall back to English. */
Object.assign(DICT.en, {
  signIn: 'Sign in', signUp: 'Create account', signOut: 'Sign out', account: 'Account', idLabel: 'Email or phone number', idPh: 'you@example.com or 0772 123 456',
  pwLabel: 'Password', pwNew: 'New password', pwCurrent: 'Current password', pwShow: 'Show', pwHide: 'Hide', pwHint: 'At least 8 characters. A short phrase of a few words works well.',
  forgot: 'Forgot password?', haveAcct: 'Already have an account?', noAcct: 'New here?', authWhy: 'Sign in to save your orders and track them on any device.', guest: 'Continue as guest',
  mfaTitle: 'Two-step verification', mfaPrompt: 'Enter the 6-digit code from your authenticator app, or one of your recovery codes.', mfaCode: 'Code', verify: 'Verify',
  sendLink: 'Send reset link', sentIfExists: 'If that account exists, we have sent a reset link.', resetTitle: 'Choose a new password', resetSave: 'Save password', resetDone: 'Password changed. Sign in with your new password.',
  welcome: 'Welcome, {name}', signedOut: 'You are signed out', devices: 'Your devices', thisDevice: 'This device', signOutDev: 'Sign out', signOutAll: 'Sign out everywhere', lastActive: 'Last active {when}',
  mfaInfo: 'Adds a second check when you sign in. Use an app such as Google Authenticator or Authy.', mfaOn: 'On', mfaOff: 'Off', mfaTurnOn: 'Turn on', mfaTurnOff: 'Turn off',
  mfaSetup: 'Add this key to your authenticator app, then enter the 6-digit code it shows.', mfaKey: 'Setup key', mfaOpen: 'Open in authenticator app', mfaConfirm: 'Confirm and turn on',
  recTitle: 'Save your recovery codes', recInfo: 'If you lose your phone, each code works once. They are shown only now.', copy: 'Copy', copied: 'Copied', changePw: 'Change password', pwSaved: 'Password changed. Your other devices were signed out.',
  save: 'Save', saved: 'Saved', errBad: 'Wrong email / phone or password', errExists: 'An account with this email or phone already exists. Sign in instead.', errRate: 'Too many attempts. Try again in {n} min.',
  errBusy: 'We are very busy right now. Please try again in a few seconds.', errCode: 'That code is not right', errExpired: 'This link has expired. Ask for a new one.', signInToOrder: 'Please sign in to place your order', justNow: 'just now'
});
Object.assign(DICT.sw, {
  signIn: 'Ingia', signUp: 'Fungua akaunti', signOut: 'Toka', account: 'Akaunti', idLabel: 'Barua pepe au namba ya simu', idPh: 'wewe@mfano.com au 0772 123 456',
  pwLabel: 'Nenosiri', pwNew: 'Nenosiri jipya', pwCurrent: 'Nenosiri la sasa', pwShow: 'Onyesha', pwHide: 'Ficha', pwHint: 'Angalau herufi 8. Sentensi fupi ya maneno machache inafaa.',
  forgot: 'Umesahau nenosiri?', haveAcct: 'Tayari una akaunti?', noAcct: 'Mgeni hapa?', authWhy: 'Ingia ili kuhifadhi oda zako na kuzifuatilia kwenye kifaa chochote.', guest: 'Endelea kama mgeni',
  mfaTitle: 'Uthibitishaji wa hatua mbili', mfaPrompt: 'Weka msimbo wa tarakimu 6 kutoka kwenye programu yako ya uthibitishaji, au msimbo mmoja wa kurejesha.', mfaCode: 'Msimbo', verify: 'Thibitisha',
  sendLink: 'Tuma kiungo cha kuweka upya', sentIfExists: 'Kama akaunti hiyo ipo, tumetuma kiungo cha kuweka upya.', resetTitle: 'Chagua nenosiri jipya', resetSave: 'Hifadhi nenosiri', resetDone: 'Nenosiri limebadilishwa. Ingia kwa nenosiri jipya.',
  welcome: 'Karibu, {name}', signedOut: 'Umetoka', devices: 'Vifaa vyako', thisDevice: 'Kifaa hiki', signOutDev: 'Toka', signOutAll: 'Toka kila mahali', lastActive: 'Ilitumika {when}',
  mfaInfo: 'Huongeza ukaguzi wa pili unapoingia. Tumia programu kama Google Authenticator au Authy.', mfaOn: 'Imewashwa', mfaOff: 'Imezimwa', mfaTurnOn: 'Washa', mfaTurnOff: 'Zima',
  mfaSetup: 'Weka ufunguo huu kwenye programu yako ya uthibitishaji, kisha andika msimbo wa tarakimu 6 unaoonyesha.', mfaKey: 'Ufunguo wa usanidi', mfaOpen: 'Fungua kwenye programu ya uthibitishaji', mfaConfirm: 'Thibitisha na uwashe',
  recTitle: 'Hifadhi misimbo yako ya kurejesha', recInfo: 'Ukipoteza simu, kila msimbo hufanya kazi mara moja. Inaonyeshwa sasa tu.', copy: 'Nakili', copied: 'Imenakiliwa', changePw: 'Badilisha nenosiri', pwSaved: 'Nenosiri limebadilishwa. Vifaa vyako vingine vimetolewa.',
  save: 'Hifadhi', saved: 'Imehifadhiwa', errBad: 'Barua pepe / simu au nenosiri si sahihi', errExists: 'Akaunti yenye barua pepe au simu hii tayari ipo. Ingia badala yake.', errRate: 'Majaribio mengi mno. Jaribu tena baada ya dakika {n}.',
  errBusy: 'Tuna shughuli nyingi sasa. Tafadhali jaribu tena baada ya sekunde chache.', errCode: 'Msimbo huo si sahihi', errExpired: 'Kiungo hiki kimeisha muda. Omba kipya.', signInToOrder: 'Tafadhali ingia ili uweke oda yako', justNow: 'sasa hivi'
});
Object.assign(DICT.fr, {
  signIn: 'Se connecter', signUp: 'Créer un compte', signOut: 'Se déconnecter', account: 'Compte', idLabel: 'E-mail ou numéro de téléphone', idPh: 'vous@exemple.com ou 06 12 34 56 78',
  pwLabel: 'Mot de passe', pwNew: 'Nouveau mot de passe', pwCurrent: 'Mot de passe actuel', pwShow: 'Afficher', pwHide: 'Masquer', pwHint: 'Au moins 8 caractères. Une courte phrase de quelques mots fonctionne bien.',
  forgot: 'Mot de passe oublié ?', haveAcct: 'Vous avez déjà un compte ?', noAcct: 'Nouveau ici ?', authWhy: 'Connectez-vous pour enregistrer vos commandes et les suivre sur n’importe quel appareil.', guest: 'Continuer en invité',
  mfaTitle: 'Validation en deux étapes', mfaPrompt: 'Saisissez le code à 6 chiffres de votre application d’authentification, ou un code de secours.', mfaCode: 'Code', verify: 'Vérifier',
  sendLink: 'Envoyer le lien', sentIfExists: 'Si ce compte existe, nous avons envoyé un lien de réinitialisation.', resetTitle: 'Choisissez un nouveau mot de passe', resetSave: 'Enregistrer', resetDone: 'Mot de passe modifié. Connectez-vous avec le nouveau.',
  welcome: 'Bienvenue, {name}', signedOut: 'Vous êtes déconnecté', devices: 'Vos appareils', thisDevice: 'Cet appareil', signOutDev: 'Déconnecter', signOutAll: 'Se déconnecter partout', lastActive: 'Dernière activité : {when}',
  mfaInfo: 'Ajoute une seconde vérification à la connexion. Utilisez une application comme Google Authenticator ou Authy.', mfaOn: 'Activée', mfaOff: 'Désactivée', mfaTurnOn: 'Activer', mfaTurnOff: 'Désactiver',
  mfaSetup: 'Ajoutez cette clé à votre application d’authentification, puis saisissez le code à 6 chiffres affiché.', mfaKey: 'Clé de configuration', mfaOpen: 'Ouvrir dans l’application', mfaConfirm: 'Confirmer et activer',
  recTitle: 'Conservez vos codes de secours', recInfo: 'Si vous perdez votre téléphone, chaque code ne fonctionne qu’une fois. Ils ne s’affichent qu’ici.', copy: 'Copier', copied: 'Copié', changePw: 'Changer le mot de passe', pwSaved: 'Mot de passe modifié. Vos autres appareils ont été déconnectés.',
  save: 'Enregistrer', saved: 'Enregistré', errBad: 'E-mail / téléphone ou mot de passe incorrect', errExists: 'Un compte existe déjà avec cet e-mail ou ce téléphone. Connectez-vous.', errRate: 'Trop de tentatives. Réessayez dans {n} min.',
  errBusy: 'Nous sommes très sollicités. Réessayez dans quelques secondes.', errCode: 'Ce code n’est pas correct', errExpired: 'Ce lien a expiré. Demandez-en un nouveau.', signInToOrder: 'Connectez-vous pour passer votre commande', justNow: 'à l’instant'
});
Object.assign(DICT.es, {
  signIn: 'Iniciar sesión', signUp: 'Crear cuenta', signOut: 'Cerrar sesión', account: 'Cuenta', idLabel: 'Correo o número de teléfono', idPh: 'tu@ejemplo.com o 55 1234 5678',
  pwLabel: 'Contraseña', pwNew: 'Nueva contraseña', pwCurrent: 'Contraseña actual', pwShow: 'Mostrar', pwHide: 'Ocultar', pwHint: 'Al menos 8 caracteres. Una frase corta de varias palabras funciona bien.',
  forgot: '¿Olvidaste tu contraseña?', haveAcct: '¿Ya tienes cuenta?', noAcct: '¿Eres nuevo?', authWhy: 'Inicia sesión para guardar tus pedidos y seguirlos desde cualquier dispositivo.', guest: 'Continuar como invitado',
  mfaTitle: 'Verificación en dos pasos', mfaPrompt: 'Escribe el código de 6 dígitos de tu app de autenticación, o un código de recuperación.', mfaCode: 'Código', verify: 'Verificar',
  sendLink: 'Enviar enlace', sentIfExists: 'Si la cuenta existe, hemos enviado un enlace para restablecer la contraseña.', resetTitle: 'Elige una nueva contraseña', resetSave: 'Guardar contraseña', resetDone: 'Contraseña cambiada. Inicia sesión con la nueva.',
  welcome: 'Bienvenido, {name}', signedOut: 'Has cerrado sesión', devices: 'Tus dispositivos', thisDevice: 'Este dispositivo', signOutDev: 'Cerrar sesión', signOutAll: 'Cerrar sesión en todas partes', lastActive: 'Última actividad: {when}',
  mfaInfo: 'Añade una segunda comprobación al iniciar sesión. Usa una app como Google Authenticator o Authy.', mfaOn: 'Activada', mfaOff: 'Desactivada', mfaTurnOn: 'Activar', mfaTurnOff: 'Desactivar',
  mfaSetup: 'Añade esta clave a tu app de autenticación y escribe el código de 6 dígitos que muestra.', mfaKey: 'Clave de configuración', mfaOpen: 'Abrir en la app de autenticación', mfaConfirm: 'Confirmar y activar',
  recTitle: 'Guarda tus códigos de recuperación', recInfo: 'Si pierdes el teléfono, cada código funciona una sola vez. Solo se muestran ahora.', copy: 'Copiar', copied: 'Copiado', changePw: 'Cambiar contraseña', pwSaved: 'Contraseña cambiada. Se cerró la sesión en tus otros dispositivos.',
  save: 'Guardar', saved: 'Guardado', errBad: 'Correo / teléfono o contraseña incorrectos', errExists: 'Ya existe una cuenta con este correo o teléfono. Inicia sesión.', errRate: 'Demasiados intentos. Inténtalo de nuevo en {n} min.',
  errBusy: 'Tenemos mucha demanda ahora. Inténtalo de nuevo en unos segundos.', errCode: 'Ese código no es correcto', errExpired: 'Este enlace ha caducado. Solicita uno nuevo.', signInToOrder: 'Inicia sesión para hacer tu pedido', justNow: 'ahora mismo'
});
Object.assign(DICT.pt, {
  signIn: 'Entrar', signUp: 'Criar conta', signOut: 'Sair', account: 'Conta', idLabel: 'E-mail ou número de telefone', idPh: 'voce@exemplo.com ou 11 91234-5678',
  pwLabel: 'Senha', pwNew: 'Nova senha', pwCurrent: 'Senha atual', pwShow: 'Mostrar', pwHide: 'Ocultar', pwHint: 'Pelo menos 8 caracteres. Uma frase curta com algumas palavras funciona bem.',
  forgot: 'Esqueceu a senha?', haveAcct: 'Já tem uma conta?', noAcct: 'Novo por aqui?', authWhy: 'Entre para salvar seus pedidos e acompanhá-los em qualquer dispositivo.', guest: 'Continuar como visitante',
  mfaTitle: 'Verificação em duas etapas', mfaPrompt: 'Digite o código de 6 dígitos do seu app autenticador, ou um código de recuperação.', mfaCode: 'Código', verify: 'Verificar',
  sendLink: 'Enviar link', sentIfExists: 'Se essa conta existir, enviamos um link para redefinir a senha.', resetTitle: 'Escolha uma nova senha', resetSave: 'Salvar senha', resetDone: 'Senha alterada. Entre com a nova senha.',
  welcome: 'Bem-vindo, {name}', signedOut: 'Você saiu da conta', devices: 'Seus dispositivos', thisDevice: 'Este dispositivo', signOutDev: 'Sair', signOutAll: 'Sair de todos os lugares', lastActive: 'Última atividade: {when}',
  mfaInfo: 'Adiciona uma segunda verificação ao entrar. Use um app como Google Authenticator ou Authy.', mfaOn: 'Ativada', mfaOff: 'Desativada', mfaTurnOn: 'Ativar', mfaTurnOff: 'Desativar',
  mfaSetup: 'Adicione esta chave ao seu app autenticador e digite o código de 6 dígitos que ele mostra.', mfaKey: 'Chave de configuração', mfaOpen: 'Abrir no app autenticador', mfaConfirm: 'Confirmar e ativar',
  recTitle: 'Guarde seus códigos de recuperação', recInfo: 'Se perder o celular, cada código funciona uma vez. Eles aparecem só agora.', copy: 'Copiar', copied: 'Copiado', changePw: 'Alterar senha', pwSaved: 'Senha alterada. Seus outros dispositivos foram desconectados.',
  save: 'Salvar', saved: 'Salvo', errBad: 'E-mail / telefone ou senha incorretos', errExists: 'Já existe uma conta com este e-mail ou telefone. Entre nela.', errRate: 'Muitas tentativas. Tente novamente em {n} min.',
  errBusy: 'Estamos com muita demanda agora. Tente novamente em alguns segundos.', errCode: 'Esse código não está correto', errExpired: 'Este link expirou. Peça um novo.', signInToOrder: 'Entre para fazer seu pedido', justNow: 'agora mesmo'
});
Object.assign(DICT.de, {
  signIn: 'Anmelden', signUp: 'Konto erstellen', signOut: 'Abmelden', account: 'Konto', idLabel: 'E-Mail oder Telefonnummer', idPh: 'du@beispiel.de oder 0151 2345678',
  pwLabel: 'Passwort', pwNew: 'Neues Passwort', pwCurrent: 'Aktuelles Passwort', pwShow: 'Anzeigen', pwHide: 'Verbergen', pwHint: 'Mindestens 8 Zeichen. Ein kurzer Satz aus ein paar Wörtern eignet sich gut.',
  forgot: 'Passwort vergessen?', haveAcct: 'Schon ein Konto?', noAcct: 'Neu hier?', authWhy: 'Melde dich an, um Bestellungen zu speichern und auf jedem Gerät zu verfolgen.', guest: 'Als Gast fortfahren',
  mfaTitle: 'Zwei-Schritte-Bestätigung', mfaPrompt: 'Gib den 6-stelligen Code aus deiner Authenticator-App oder einen Wiederherstellungscode ein.', mfaCode: 'Code', verify: 'Bestätigen',
  sendLink: 'Link senden', sentIfExists: 'Falls es das Konto gibt, haben wir einen Link zum Zurücksetzen gesendet.', resetTitle: 'Neues Passwort wählen', resetSave: 'Passwort speichern', resetDone: 'Passwort geändert. Melde dich mit dem neuen Passwort an.',
  welcome: 'Willkommen, {name}', signedOut: 'Du bist abgemeldet', devices: 'Deine Geräte', thisDevice: 'Dieses Gerät', signOutDev: 'Abmelden', signOutAll: 'Überall abmelden', lastActive: 'Zuletzt aktiv: {when}',
  mfaInfo: 'Fügt beim Anmelden eine zweite Prüfung hinzu. Nutze eine App wie Google Authenticator oder Authy.', mfaOn: 'An', mfaOff: 'Aus', mfaTurnOn: 'Einschalten', mfaTurnOff: 'Ausschalten',
  mfaSetup: 'Füge diesen Schlüssel deiner Authenticator-App hinzu und gib den angezeigten 6-stelligen Code ein.', mfaKey: 'Einrichtungsschlüssel', mfaOpen: 'In Authenticator-App öffnen', mfaConfirm: 'Bestätigen und einschalten',
  recTitle: 'Wiederherstellungscodes speichern', recInfo: 'Wenn du dein Handy verlierst, funktioniert jeder Code einmal. Sie werden nur jetzt angezeigt.', copy: 'Kopieren', copied: 'Kopiert', changePw: 'Passwort ändern', pwSaved: 'Passwort geändert. Deine anderen Geräte wurden abgemeldet.',
  save: 'Speichern', saved: 'Gespeichert', errBad: 'E-Mail / Telefon oder Passwort falsch', errExists: 'Mit dieser E-Mail oder Telefonnummer gibt es schon ein Konto. Melde dich an.', errRate: 'Zu viele Versuche. Versuche es in {n} Min. erneut.',
  errBusy: 'Gerade ist viel los. Bitte versuche es in ein paar Sekunden erneut.', errCode: 'Dieser Code ist nicht richtig', errExpired: 'Dieser Link ist abgelaufen. Fordere einen neuen an.', signInToOrder: 'Bitte melde dich an, um zu bestellen', justNow: 'gerade eben'
});
Object.assign(DICT.hi, {
  signIn: 'साइन इन', signUp: 'खाता बनाएँ', signOut: 'साइन आउट', account: 'खाता', idLabel: 'ईमेल या फ़ोन नंबर', idPh: 'you@example.com या 98765 43210',
  pwLabel: 'पासवर्ड', pwNew: 'नया पासवर्ड', pwCurrent: 'मौजूदा पासवर्ड', pwShow: 'दिखाएँ', pwHide: 'छिपाएँ', pwHint: 'कम से कम 8 अक्षर। कुछ शब्दों का छोटा वाक्य अच्छा रहता है।',
  forgot: 'पासवर्ड भूल गए?', haveAcct: 'पहले से खाता है?', noAcct: 'नए हैं?', authWhy: 'अपने ऑर्डर सहेजने और किसी भी डिवाइस पर ट्रैक करने के लिए साइन इन करें।', guest: 'अतिथि के रूप में जारी रखें',
  mfaTitle: 'दो-चरणीय सत्यापन', mfaPrompt: 'अपने ऑथेंटिकेटर ऐप का 6 अंकों का कोड या कोई रिकवरी कोड डालें।', mfaCode: 'कोड', verify: 'सत्यापित करें',
  sendLink: 'रीसेट लिंक भेजें', sentIfExists: 'अगर वह खाता मौजूद है, तो हमने रीसेट लिंक भेज दिया है।', resetTitle: 'नया पासवर्ड चुनें', resetSave: 'पासवर्ड सहेजें', resetDone: 'पासवर्ड बदल गया। नए पासवर्ड से साइन इन करें।',
  welcome: 'स्वागत है, {name}', signedOut: 'आप साइन आउट हो गए हैं', devices: 'आपके डिवाइस', thisDevice: 'यह डिवाइस', signOutDev: 'साइन आउट', signOutAll: 'हर जगह से साइन आउट', lastActive: 'आख़िरी बार सक्रिय: {when}',
  mfaInfo: 'साइन इन करते समय दूसरी जाँच जोड़ता है। Google Authenticator या Authy जैसा ऐप इस्तेमाल करें।', mfaOn: 'चालू', mfaOff: 'बंद', mfaTurnOn: 'चालू करें', mfaTurnOff: 'बंद करें',
  mfaSetup: 'यह कुंजी अपने ऑथेंटिकेटर ऐप में जोड़ें, फिर वहाँ दिखने वाला 6 अंकों का कोड डालें।', mfaKey: 'सेटअप कुंजी', mfaOpen: 'ऑथेंटिकेटर ऐप में खोलें', mfaConfirm: 'पुष्टि करें और चालू करें',
  recTitle: 'अपने रिकवरी कोड सहेजें', recInfo: 'फ़ोन खो जाए तो हर कोड एक बार काम करता है। ये केवल अभी दिखाए जाते हैं।', copy: 'कॉपी करें', copied: 'कॉपी हो गया', changePw: 'पासवर्ड बदलें', pwSaved: 'पासवर्ड बदल गया। आपके बाकी डिवाइस साइन आउट कर दिए गए।',
  save: 'सहेजें', saved: 'सहेजा गया', errBad: 'ईमेल / फ़ोन या पासवर्ड गलत है', errExists: 'इस ईमेल या फ़ोन से खाता पहले से है। साइन इन करें।', errRate: 'बहुत ज़्यादा कोशिशें। {n} मिनट बाद फिर कोशिश करें।',
  errBusy: 'अभी बहुत भीड़ है। कुछ सेकंड बाद फिर कोशिश करें।', errCode: 'यह कोड सही नहीं है', errExpired: 'यह लिंक समाप्त हो गया है। नया माँगें।', signInToOrder: 'ऑर्डर देने के लिए कृपया साइन इन करें', justNow: 'अभी'
});
Object.assign(DICT.ar, {
  signIn: 'تسجيل الدخول', signUp: 'إنشاء حساب', signOut: 'تسجيل الخروج', account: 'الحساب', idLabel: 'البريد الإلكتروني أو رقم الهاتف', idPh: 'you@example.com أو 050 123 4567',
  pwLabel: 'كلمة المرور', pwNew: 'كلمة مرور جديدة', pwCurrent: 'كلمة المرور الحالية', pwShow: 'إظهار', pwHide: 'إخفاء', pwHint: '8 أحرف على الأقل. جملة قصيرة من بضع كلمات خيار جيد.',
  forgot: 'نسيت كلمة المرور؟', haveAcct: 'لديك حساب بالفعل؟', noAcct: 'جديد هنا؟', authWhy: 'سجّل الدخول لحفظ طلباتك وتتبعها على أي جهاز.', guest: 'المتابعة كضيف',
  mfaTitle: 'التحقق بخطوتين', mfaPrompt: 'أدخل الرمز المكوّن من 6 أرقام من تطبيق المصادقة، أو أحد رموز الاسترداد.', mfaCode: 'الرمز', verify: 'تحقق',
  sendLink: 'إرسال رابط إعادة التعيين', sentIfExists: 'إذا كان الحساب موجودًا، فقد أرسلنا رابط إعادة التعيين.', resetTitle: 'اختر كلمة مرور جديدة', resetSave: 'حفظ كلمة المرور', resetDone: 'تم تغيير كلمة المرور. سجّل الدخول بكلمة المرور الجديدة.',
  welcome: 'مرحبًا، {name}', signedOut: 'تم تسجيل خروجك', devices: 'أجهزتك', thisDevice: 'هذا الجهاز', signOutDev: 'تسجيل الخروج', signOutAll: 'تسجيل الخروج من كل مكان', lastActive: 'آخر نشاط: {when}',
  mfaInfo: 'يضيف فحصًا ثانيًا عند تسجيل الدخول. استخدم تطبيقًا مثل Google Authenticator أو Authy.', mfaOn: 'مفعّل', mfaOff: 'متوقف', mfaTurnOn: 'تفعيل', mfaTurnOff: 'إيقاف',
  mfaSetup: 'أضف هذا المفتاح إلى تطبيق المصادقة ثم أدخل الرمز المكوّن من 6 أرقام الذي يظهر فيه.', mfaKey: 'مفتاح الإعداد', mfaOpen: 'فتح في تطبيق المصادقة', mfaConfirm: 'تأكيد وتفعيل',
  recTitle: 'احفظ رموز الاسترداد', recInfo: 'إذا فقدت هاتفك، يعمل كل رمز مرة واحدة فقط. تظهر الآن فقط.', copy: 'نسخ', copied: 'تم النسخ', changePw: 'تغيير كلمة المرور', pwSaved: 'تم تغيير كلمة المرور. تم تسجيل خروج أجهزتك الأخرى.',
  save: 'حفظ', saved: 'تم الحفظ', errBad: 'البريد الإلكتروني / الهاتف أو كلمة المرور غير صحيحة', errExists: 'يوجد حساب بهذا البريد أو الهاتف. سجّل الدخول بدلًا من ذلك.', errRate: 'محاولات كثيرة. حاول مجددًا بعد {n} دقيقة.',
  errBusy: 'لدينا ضغط كبير الآن. حاول مجددًا بعد ثوانٍ.', errCode: 'هذا الرمز غير صحيح', errExpired: 'انتهت صلاحية هذا الرابط. اطلب رابطًا جديدًا.', signInToOrder: 'يرجى تسجيل الدخول لإتمام طلبك', justNow: 'الآن'
});
Object.assign(DICT.ja, {
  signIn: 'ログイン', signUp: 'アカウント作成', signOut: 'ログアウト', account: 'アカウント', idLabel: 'メールアドレスまたは電話番号', idPh: 'you@example.com または 090 1234 5678',
  pwLabel: 'パスワード', pwNew: '新しいパスワード', pwCurrent: '現在のパスワード', pwShow: '表示', pwHide: '非表示', pwHint: '8文字以上。短いフレーズ（数語）がおすすめです。',
  forgot: 'パスワードをお忘れですか？', haveAcct: 'すでにアカウントをお持ちですか？', noAcct: '初めてですか？', authWhy: 'ログインすると、注文を保存してどの端末からでも追跡できます。', guest: 'ゲストとして続ける',
  mfaTitle: '2段階認証', mfaPrompt: '認証アプリの6桁のコード、またはリカバリーコードを入力してください。', mfaCode: 'コード', verify: '確認',
  sendLink: 'リセットリンクを送信', sentIfExists: 'アカウントが存在する場合、リセット用のリンクを送信しました。', resetTitle: '新しいパスワードを設定', resetSave: 'パスワードを保存', resetDone: 'パスワードを変更しました。新しいパスワードでログインしてください。',
  welcome: 'ようこそ、{name}さん', signedOut: 'ログアウトしました', devices: 'お使いの端末', thisDevice: 'この端末', signOutDev: 'ログアウト', signOutAll: 'すべての端末からログアウト', lastActive: '最終利用: {when}',
  mfaInfo: 'ログイン時に2つ目の確認を追加します。Google Authenticator や Authy などのアプリをご利用ください。', mfaOn: 'オン', mfaOff: 'オフ', mfaTurnOn: 'オンにする', mfaTurnOff: 'オフにする',
  mfaSetup: 'このキーを認証アプリに追加し、表示される6桁のコードを入力してください。', mfaKey: 'セットアップキー', mfaOpen: '認証アプリで開く', mfaConfirm: '確認してオンにする',
  recTitle: 'リカバリーコードを保存', recInfo: '携帯を紛失した場合、各コードは1回だけ使えます。表示されるのは今だけです。', copy: 'コピー', copied: 'コピーしました', changePw: 'パスワードを変更', pwSaved: 'パスワードを変更しました。他の端末はログアウトされました。',
  save: '保存', saved: '保存しました', errBad: 'メール／電話番号またはパスワードが違います', errExists: 'このメールまたは電話番号のアカウントは既にあります。ログインしてください。', errRate: '試行回数が多すぎます。{n}分後にもう一度お試しください。',
  errBusy: 'ただいま混み合っています。数秒後にもう一度お試しください。', errCode: 'コードが正しくありません', errExpired: 'このリンクは期限切れです。新しいリンクをリクエストしてください。', signInToOrder: '注文するにはログインしてください', justNow: 'たった今'
});
