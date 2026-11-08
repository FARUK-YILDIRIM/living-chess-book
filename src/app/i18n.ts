/**
 * The app's words. English is the key, so that a missing Turkish line still reads as a sentence.
 * "Continue with ChatGPT" stays in English in both languages: OpenAI requires that label.
 */
const TURKISH = {
  // Library
  'Living Chess Book': 'Living Chess Book',
  Settings: 'Ayarlar',
  Library: 'Kitaplık',
  'Open a chess book': 'Bir satranç kitabı açın',
  'Choose a PDF you own. Click any move or diagram on its pages to see it on a live board.':
    'Size ait bir PDF seçin. Sayfalardaki hamleye veya diyagrama tıklayın, tahtada görün.',
  'Choose a PDF': 'PDF seç',
  'Open another PDF': 'Başka bir PDF aç',
  'Try the sample book': 'Örnek kitapla dene',
  'Sample book': 'Örnek kitap',
  'The sample book could not be loaded.': 'Örnek kitap yüklenemedi.',
  'Your books stay on this computer, where the app keeps a private copy. Parts of a book leave it only if you start AI reading.':
    'Kitaplarınız bu bilgisayarda kalır, uygulama kendine özel bir kopya saklar. Kitabın parçaları yalnızca yapay zekâ okumasını başlatırsanız dışarı çıkar.',
  'Your books': 'Kitaplarınız',
  Remove: 'Kaldır',
  'Remove {name}': '{name} kitabını kaldır',
  'Keep it': 'Vazgeç',
  'Remove this book, its analysis, your corrections and your notes from the app? The file on your computer stays.':
    'Bu kitap, analizi, düzeltmeleriniz ve notlarınız uygulamadan kaldırılsın mı? Bilgisayarınızdaki dosya silinmez.',
  'This book could not be removed.': 'Bu kitap kaldırılamadı.',
  'Your library could not be read.': 'Kitaplığınız okunamadı.',
  '{pages} pages, not analyzed yet': '{pages} sayfa, henüz analiz edilmedi',
  '{pages} pages, {moves} moves': '{pages} sayfa, {moves} hamle',
  '{count} in your notebook': 'Defterinizde {count} kayıt',
  '{count} positions to practise': '{count} pozisyon tekrar bekliyor',
  'Continue from page {page}': '{page}. sayfadan devam et',
  'Start reading': 'Okumaya başla',
  'Last read: page {page}': 'Son okunan: {page}. sayfa',

  // Notebook
  'Study notebook': 'Çalışma defteri',
  'Notebook ({count})': 'Defter ({count})',
  'Page {page}': 'Sayfa {page}',
  'Your own moves': 'Kendi denemeniz',
  'Your note': 'Notunuz',
  'Your thoughts on this page or position': 'Bu sayfa veya pozisyon hakkında düşünceleriniz',
  'Take note': 'Not al',
  'Enter saves, Shift+Enter starts a new line.': 'Enter kaydeder, Shift+Enter yeni satır açar.',
  'Attaches to: {where}': 'Bağlanacağı yer: {where}',
  Show: 'Göster',
  'All ({count})': 'Tümü ({count})',
  'This page ({count})': 'Bu sayfa ({count})',
  'Positions ({count})': 'Pozisyonlar ({count})',
  'Nothing here yet.': 'Burada henüz bir şey yok.',
  'Write something below, or save a position. It stays tied to this page and position, and a click brings you back.':
    'Aşağıya bir şey yazın veya pozisyonu kaydedin. Bu sayfaya ve pozisyona bağlı kalır, tıklayınca buraya dönersiniz.',
  'Saved position': 'Kayıtlı pozisyon',
  'Save position': 'Pozisyonu kaydet',
  Saved: 'Kayıtlı',
  'Click a move or diagram first, or try a move on the board.': 'Önce bir hamleye veya diyagrama tıklayın ya da tahtada bir hamle deneyin.',
  'Go back to this page and position': 'Bu sayfaya ve pozisyona dön',
  'Go back to this page': 'Bu sayfaya dön',
  'Add a note': 'Not ekle',
  Edit: 'Düzenle',
  Delete: 'Sil',
  'Deleted.': 'Silindi.',
  Undo: 'Geri al',
  'Export notes': 'Notları dışa aktar',
  'Notes on {name}': '{name}: çalışma notları',
  'You have a note on this move.': 'Bu hamlede notunuz var.',
  'Your notebook could not be read.': 'Defteriniz okunamadı.',
  'What you wrote could not be saved, so it is still here.': 'Yazdıklarınız kaydedilemedi, bu yüzden hâlâ burada duruyor.',
  'This change could not be saved.': 'Bu değişiklik kaydedilemedi.',
  'That note was deleted in another window, so what you wrote is now in the box below.':
    'Bu not başka bir pencerede silinmiş, yazdıklarınız aşağıdaki kutuya taşındı.',

  // Engine
  Engine: 'Motor',
  'A chess engine that runs on this computer': 'Bu bilgisayarda çalışan bir satranç motoru',
  'Depth {depth}': 'Derinlik {depth}',
  'The engine is starting…': 'Motor başlıyor…',
  'The engine could not start. Turn it off and on to try again.': 'Motor başlatılamadı. Yeniden denemek için kapatıp açın.',
  'The game has ended in this position.': 'Bu pozisyonda oyun bitmiş.',
  'This position cannot occur in a game, so the engine cannot look at it. The diagram may be misread.':
    'Bu pozisyon bir oyunda oluşamaz, bu yüzden motor bakamıyor. Diyagram yanlış okunmuş olabilir.',

  // Guessing
  'Guess the move': 'Tahmin et',
  'Stop guessing': 'Tahmini bitir',
  "Find the book's moves yourself, with those still to come covered on the page": 'Kitabın hamlelerini kendiniz bulun, sıradakiler sayfada kapatılır',
  'What does White play? Make the move on the board.': 'Beyaz ne oynar? Hamleyi tahtada yapın.',
  'What does Black play? Make the move on the board.': 'Siyah ne oynar? Hamleyi tahtada yapın.',
  'Right.': 'Doğru.',
  'The book plays something else here. Try again, or show its move.': 'Kitap burada başka bir hamle oynuyor. Yeniden deneyin ya da hamleyi gösterin.',
  'The book looks at this in a side line, but prefers another move. Try again, or show its move.':
    'Kitap buna yan varyantta bakıyor ama başka bir hamleyi tercih ediyor. Yeniden deneyin ya da hamleyi gösterin.',
  'That is the end of this line.': 'Bu varyant burada bitiyor.',
  'The book has no move to follow from here. Click a move or diagram on the page.': 'Kitapta buradan devam eden bir hamle yok. Sayfadaki bir hamleye veya diyagrama tıklayın.',
  'The app is unsure it read the next move correctly.': 'Uygulama sıradaki hamleyi doğru okuduğundan emin değil.',
  '{right} of {total} at the first try': '{total} hamlede {right} ilk denemede',
  'Show the move': 'Hamleyi göster',
  "You have left the book's moves. Go back to the book to carry on.": 'Kitabın hamlelerinden ayrıldınız. Devam etmek için kitaba dönün.',

  // Coach
  Coach: 'Koç',
  'Ask the coach': 'Koça sor',
  'Write a note': 'Bir not yazın',
  'The coach is thinking. This can take up to a minute.': 'Koç düşünüyor. Bu bir dakikayı bulabilir.',
  'This cannot be played from this position. It may be meant for later in a plan.': 'Bu hamle bu pozisyondan oynanamaz. Planın ilerisi için düşünülmüş olabilir.',
  'The coach could not answer.': 'Koç yanıt veremedi.',
  'The coach needs a connection to an AI provider.': 'Koç için bir yapay zekâ sağlayıcısına bağlantı gerekiyor.',
  "Your questions, this position, the book's line, the engine lines, your notes on this position and any text you selected go to {destination}. Their terms apply. This holds until you close the app or choose another provider.":
    'Sorularınız, bu pozisyon, kitabın hamleleri, motor varyantları, bu pozisyondaki notlarınız ve seçtiğiniz metin {destination} adresine gider. Onların koşulları geçerlidir. Bu izin, uygulamayı kapatana ya da sağlayıcı değiştirene kadar sürer.',
  'I agree': 'Kabul ediyorum',
  'Open the coach': 'Koçu aç',
  'Close the coach': 'Koçu kapat',
  'Close the notebook': 'Defteri kapat',
  'The coach is thinking…': 'Koç düşünüyor…',
  'A new answer from the coach': 'Koçtan yeni bir yanıt var',
  'Ask about this position, or about text you select on the page.': 'Bu pozisyonu ya da sayfada seçtiğiniz metni sorun.',
  'Click a move or diagram on the page, and the coach can talk about that position.': 'Sayfadan bir hamleye ya da diyagrama tıklayın, koç o pozisyonu konuşabilsin.',
  'Ask about: {where}': 'Konu: {where}',
  'Ask anything about this position': 'Bu pozisyonla ilgili bir şey sorun',
  'While you guess, the coach only gives hints.': 'Siz tahmin ederken koç yalnızca ipucu verir.',
  'What is the plan here?': 'Burada plan ne olmalı?',
  'Why is this move played?': 'Bu hamle neden oynandı?',
  'What should I watch out for?': 'Nelere dikkat etmeliyim?',
  'Give me a hint.': 'Bana bir ipucu ver.',
  'Options': 'Seçenekler',
  'You chose AI reading when you added this book. Check what it would cost below, tick to agree, and start it. You can keep reading while it runs.': 'Bu kitabı eklerken yapay zekâyla okumayı seçtiniz. Aşağıda maliyetine bakın, onay kutusunu işaretleyip başlatın. Okuma sürerken kitabı okumaya devam edebilirsiniz.',
  'About {minutes} minutes, reading {parallel} stretches at a time. It can take longer.': 'Yaklaşık {minutes} dakika, aynı anda {parallel} parça okunarak. Daha uzun sürebilir.',
  'The analysis was added, with {moves} moves. {dropped} moves did not fit the rules of chess, so they were left out, and their places are listed to check.': 'Analiz eklendi: {moves} hamle. {dropped} hamle satranç kurallarına uymadığı için alınmadı, yerleri kontrol listesine eklendi.',
  'The analysis was added, with {moves} moves.': 'Analiz eklendi: {moves} hamle.',
  '{added} entries were added to your notebook, and {already} were already in it.': 'Defterinize {added} kayıt eklendi, {already} kayıt zaten vardı.',
  'Export the analysis': 'Analizi dışa aktar',
  'Import an analysis…': 'Analiz içe aktar…',
  'Back up the notebook': 'Defteri yedekle',
  'Restore a notebook…': 'Defteri geri yükle…',
  'An analysis or notebook file fits only the very PDF it was made from, and holds no text of the book.': 'Analiz ve defter dosyaları yalnızca yapıldıkları PDF dosyasına uyar ve kitabın metnini içermez.',
  'The app is unsure of many places in this book, as happens with scanned books. AI reading can make it more accurate.': 'Uygulama bu kitapta pek çok yerden emin değil; taranmış kitaplarda böyle olur. Yapay zekâyla okuma doğruluğu artırabilir.',
  'See AI reading': 'Yapay zekâyla okumaya bak',
  'How should this book be read?': 'Bu kitap nasıl okunsun?',
  'Quick, and free': 'Hızlı ve ücretsiz',
  'Read on this computer in a few minutes, and nothing leaves it. Most moves come out right in a digital book. In a scanned one, about half do, and the rest are marked for you to check.': 'Bu bilgisayarda birkaç dakikada okunur, hiçbir şey dışarı çıkmaz. Dijital kitaplarda hamlelerin çoğu doğru okunur. Taranmış kitaplarda yaklaşık yarısı doğru çıkar, kalanı kontrol etmeniz için işaretlenir.',
  'With AI, more accurate and paid': 'Yapay zekâ ile, daha doğru ve ücretli',
  'The same quick reading first, and then the lines of moves are read again by {destination}, which helps most with scanned books. The exact cost and time are shown after the first reading, and nothing is sent before you agree. Only for a book you may share this way.': 'Önce aynı hızlı okuma yapılır, sonra hamle satırları {destination} ile yeniden okunur; en çok taranmış kitaplarda işe yarar. Kesin maliyet ve süre ilk okumadan sonra gösterilir, onayınız olmadan hiçbir şey gönderilmez. Yalnızca bu şekilde paylaşma hakkınız olan kitaplar için.',
  'This needs an AI provider, chosen in Settings.': "Bunun için Ayarlar'dan bir yapay zekâ sağlayıcısı seçmeniz gerekir.",
  'This is not a file this app can read.': 'Bu, uygulamanın okuyabileceği bir dosya değil.',
  'This file is for another PDF. It only fits the very file it was made from, and not another copy or edition of the book.': 'Bu dosya başka bir PDF için. Yalnızca yapıldığı dosyaya uyar; kitabın başka bir kopyasına ya da baskısına uymaz.',
  'The stronger engine is starting. The first time can take a while.': 'Güçlü motor başlıyor. İlk seferde biraz sürebilir.',
  'Show the moves': 'Hamleleri göster',
  'Threat': 'Tehdit',
  'What the other side would play if it could move now': 'Sıra şimdi karşı tarafta olsaydı ne oynardı',
  'Not while the side to move is in check': 'Hamle sırası olan taraf şah altındayken gösterilemez',
  'Graph': 'Grafik',
  "How the score changes along the book's line": 'Kitabın varyantı boyunca değerlendirmenin değişimi',
  'Fewer lines': 'Daha az',
  'All lines': 'Tüm varyantlar',
  'How many moves ahead the engine has looked': 'Motorun kaç hamle ileriye baktığı',
  'Thinking, depth {depth}': 'Hesaplıyor, derinlik {depth}',
  'Engine settings': 'Motor ayarları',
  'The position is level': 'Pozisyon dengede',
  'White mates in {moves}': 'Beyaz {moves} hamlede mat ediyor',
  'Black mates in {moves}': 'Siyah {moves} hamlede mat ediyor',
  'White is slightly better': 'Beyaz biraz önde',
  'White is clearly better': 'Beyaz açıkça önde',
  'White is winning': 'Beyaz kazanıyor',
  'Black is slightly better': 'Siyah biraz önde',
  'Black is clearly better': 'Siyah açıkça önde',
  'Black is winning': 'Siyah kazanıyor',
  'If the other side could move now, it would play {move}.': 'Sıra şimdi karşı tarafta olsaydı {move} oynardı.',
  'The other side has nothing to play.': 'Karşı tarafın oynayacak hamlesi yok.',
  'Point at it to see it on the board, click to play it': 'Üstüne gelince tahtada görünür, tıklayınca oynanır',
  'Ask the coach about this line': 'Bu varyantı koça sor',
  'Ask': 'Sor',
  'What does the other side threaten here, with {line}?': 'Karşı taraf burada {line} ile neyi tehdit ediyor?',
  'Explain this line from the engine: {line}': 'Motorun bu varyantını açıklar mısın: {line}',
  'The book plays {move}. The engine is still weighing it.': 'Kitap {move} oynuyor. Motor henüz tartıyor.',
  "The book plays {move}, which is the engine's first choice too.": 'Kitap {move} oynuyor, bu motorun da ilk tercihi.',
  "The book plays {move}, the engine's choice number {rank}, and about as good.": 'Kitap {move} oynuyor: motorun {rank}. tercihi, neredeyse aynı değerde.',
  'The book plays {move}, and the engine rates it about as highly as its own choice.': 'Kitap {move} oynuyor, motor bunu kendi tercihi kadar iyi buluyor.',
  'The book plays {move}. It is playable, but the engine prefers {best} by about {pawns} pawns.': 'Kitap {move} oynuyor. Oynanabilir, ama motor {best} hamlesini yaklaşık {pawns} piyon daha iyi buluyor.',
  'The book plays {move}, but by the engine it misses a mate, or allows one. The engine plays {best}.': 'Kitap {move} oynuyor, ama motora göre bu bir matı kaçırıyor ya da mata izin veriyor. Motor {best} oynuyor.',
  'The book plays {move}, but the engine finds it weak, about {pawns} pawns worse than {best}.': 'Kitap {move} oynuyor, ama motor bunu zayıf buluyor: {best} hamlesinden yaklaşık {pawns} piyon kötü.',
  'Lines to show': 'Gösterilecek varyant',
  'Arrows on the board': 'Tahtada oklar',
  'Hint mode: hide the moves until asked': 'İpucu modu: hamleleri istenene kadar gizle',
  'Stronger engine (about 99 MB, slower to start)': 'Güçlü motor (yaklaşık 99 MB, daha geç başlar)',
  'White above the middle, Black below. Click to go to a move.': 'Ortanın üstü Beyaz, altı Siyah lehine. Hamleye gitmek için tıklayın.',
  'Scoring {done} of {total}…': '{total} pozisyonun {done} tanesi hesaplandı…',
  'Score {count} positions': '{count} pozisyonu hesapla',
  'Who stands better': 'Kim daha iyi durumda',
  'Not known yet': 'Henüz bilinmiyor',
  'Next step': 'Sıradaki adım',
  'The diagram on page {page}': '{page}. sayfadaki diyagram',
  'This diagram is not solved yet. Find the moves the book plays from it.': 'Bu diyagram henüz çözülmedi. Kitabın buradan oynadığı hamleleri bulun.',
  'Show it': 'Göster',
  'You have solved every diagram in this book.': 'Bu kitaptaki bütün diyagramları çözdünüz.',
  'Whole page': 'Tam sayfa',
  'Page size': 'Sayfa boyutu',
  'Fix the reading': 'Okumayı düzelt',
  'Previous place': 'Önceki yer',
  'Next place': 'Sonraki yer',
  'Leave it as it is': 'Olduğu gibi bırak',
  'All places to check ({count})': 'Kontrol edilecek tüm yerler ({count})',
  'Make this board match the diagram on the page: choose a piece, then click a square.': 'Bu tahtayı sayfadaki diyagrama benzetin: bir taş seçin, sonra kareye tıklayın.',
  'Compare with the marked place on the page. If the move differs, choose the right one.': 'Sayfada işaretli yerle karşılaştırın. Hamle farklıysa doğrusunu seçin.',
  'The marked place on the page has a move the app could not read. You can have it read with AI, or leave it.': 'Sayfada işaretli yerde uygulamanın okuyamadığı bir hamle var. Yapay zekâyla okutabilir ya da olduğu gibi bırakabilirsiniz.',
  'Piece to place': 'Yerleştirilecek taş',
  'Remove a piece': 'Taşı kaldır',
  'Write it in FEN': 'FEN olarak yaz',
  'Drag to move. Double-click to put it back.': 'Sürükleyerek taşıyın. Çift tıklarsanız yerine döner.',
  'Show more': 'Devamını göster',
  'Show less': 'Kısalt',
  'The answer could not be saved.': 'Yanıt kaydedilemedi.',
  'Saved positions are waiting to be practised': 'Kayıtlı pozisyonlar tekrar bekliyor',
  'Also send the text of this page to {destination}. Only do this with a book you may share this way.':
    'Bu sayfanın metni de {destination} hizmetine gönderilsin. Bunu yalnızca bu şekilde paylaşabileceğiniz bir kitapla yapın.',
  'What was last sent': 'En son gönderilen',
  'This does not fit the rules from this position, so the app cannot show it.': 'Bu hamle bu pozisyondan kurallara uymuyor, bu yüzden uygulama gösteremiyor.',
  'The moves marked here do not fit the rules from this position. The coach may be wrong about them.': 'İşaretli hamleler bu pozisyondan kurallara uymuyor. Koç bunlarda yanılıyor olabilir.',
  'Explain the selected passage.': 'Seçili yeri açıkla.',
  Explain: 'Açıkla',
  'Selected: {text}': 'Seçili: {text}',

  // Practice
  'Practise ({count})': 'Tekrar et ({count})',
  'Your notebook stays closed during practice, so that it gives nothing away.': 'Tekrar sırasında defter kapalı kalır, böylece cevabı ele vermez.',
  'The page stays covered until you have answered.': 'Yanıtlayana kadar sayfa kapalı kalır.',
  'What would you play here? Make the move on the board.': 'Burada ne oynardınız? Hamleyi tahtada yapın.',
  'The book has no move from this position. Think about your plan, then say whether you knew it.': 'Kitapta bu pozisyondan devam eden hamle yok. Planınızı düşünün, sonra bilip bilmediğinizi söyleyin.',
  'Did you know it?': 'Biliyor muydunuz?',
  'I knew it': 'Bildim',
  'Show my note': 'Notumu göster',
  Close: 'Kapat',
  'I did not know it': 'Bilemedim',
  'Close practice': 'Tekrarı kapat',
  'Position {number} of {total}': 'Pozisyon {number} / {total}',
  'Practice is done: you knew {known} of {total}.': 'Tekrar bitti: {total} pozisyonun {known} tanesini bildiniz.',

  // Tools
  Notebook: 'Defter',
  'Show or hide the notebook beside the page': 'Sayfanın yanındaki defteri göster veya gizle',
  'Fix the reading ({count})': 'Okumayı düzelt ({count})',
  'Go over what the app was unsure of when it read this book': 'Uygulamanın bu kitabı okurken emin olamadığı yerleri gözden geçirin',
  'Smaller page': 'Sayfayı küçült',
  'Larger page': 'Sayfayı büyüt',
  'Flip the board': 'Tahtayı çevir',
  White: 'Beyaz',
  Black: 'Siyah',
  'The book looks at:': 'Kitabın baktığı hamleler:',
  'The app is unsure of this move. Is it right in the book?': 'Uygulama bu hamleden emin değil. Kitapta böyle mi yazıyor?',
  'Keys: N note, C coach, S save, F flip, E engine, G guess': 'Kısayollar: N not, C koç, S kaydet, F çevir, E motor, G tahmin',

  // Solving
  Solve: 'Çöz',
  Contents: 'İçindekiler',
  'Show the page': 'Sayfayı aç',
  'Next diagram': 'Sıradaki diyagram',
  'Solve the next diagram': 'Sıradaki diyagramı çöz',
  '{solved} of {total} diagrams solved': '{total} diyagramın {solved} tanesi çözüldü',
  'This PDF has no table of contents the app can read.': 'Bu PDF\'te uygulamanın okuyabildiği bir içindekiler yok.',
  'A move you missed': 'Bulamadığınız hamle',
  'This misses a forced mate, or allows one, by the engine. Look again.': 'Motora göre bu, zorunlu bir matı kaçırıyor ya da mata izin veriyor. Yeniden bakın.',
  'The engine is looking at your move…': 'Motor hamlenize bakıyor…',
  'This position will come back for practice soon.': 'Bu pozisyon kısa süre sonra tekrar için gelecek.',
  'The engine rates your move about as highly. The book chose another, so look for that too.': 'Motor hamlenizi neredeyse aynı değerde görüyor. Kitap başka bir yol seçmiş, onu da arayın.',
  "Playable, but the engine prefers the book's move by about {pawns} pawns.": 'Oynanabilir, ama motor kitabın hamlesini yaklaşık {pawns} piyon daha iyi görüyor.',
  'This costs about {pawns} pawns by the engine. Look again.': 'Motora göre bu yaklaşık {pawns} piyon kaybettiriyor. Yeniden bakın.',
  'This is a serious mistake by the engine, about {pawns} pawns. Look again for what it allows.': 'Motora göre bu ciddi bir hata, yaklaşık {pawns} piyon. Neye izin verdiğine yeniden bakın.',

  'Optional. With your own account, a model can answer as your coach and read again the lines this app could not settle.': 'İsteğe bağlı. Kendi hesabınızla bir model koçunuz olarak yanıt verebilir ve uygulamanın çözemediği satırları yeniden okuyabilir.',
  'Model. AI reading needs one that can read images.': 'Model. Yapay zekâyla okuma için resim okuyabilen bir model gerekir.',
  'Ready. You will still agree to what is sent, in the book.': 'Hazır. Gönderilecekleri yine kitabın içinde onaylarsınız.',
  // Reader
  'Previous page': 'Önceki sayfa',
  'Next page': 'Sonraki sayfa',
  'Page number': 'Sayfa numarası',
  Pages: 'Sayfalar',
  'of {total}': '/ {total}',
  'More options': 'Diğer seçenekler',
  'Show side lines': 'Yan varyantları göster',
  'Analyze again': 'Yeniden analiz et',
  'A new analysis replaces your corrections to this book. Your notes stay.': 'Yeni analiz, bu kitaptaki düzeltmelerinizin yerine geçer. Notlarınız kalır.',
  'Replace them': 'Yerine geçsin',
  'Keep them': 'Düzeltmeleri koru',
  'Book page': 'Kitap sayfası',
  'Board and tools': 'Tahta ve araçlar',
  'Previous move': 'Önceki hamle',
  'Next move': 'Sonraki hamle',
  'Left arrow key': 'Sol ok tuşu',
  'Right arrow key': 'Sağ ok tuşu',
  'Back to the book': 'Kitaba dön',
  'White to move': 'Sıra beyazda',
  'Black to move': 'Sıra siyahta',
  Moves: 'Hamleler',
  Check: 'Kontrol',
  'Check ({count})': 'Kontrol ({count})',
  Pieces: 'Taşlar',
  AI: 'Yapay zekâ',
  'Click a colored move on the page, and the board goes to that position. The app is unsure of the yellow ones.':
    'Sayfadaki renkli bir hamleye tıklayın, tahta o pozisyona gelsin. Uygulama sarı olanlardan emin değil.',
  Dismiss: 'Kapat',
  'Show this move on the board': 'Bu hamleyi tahtada göster',
  'The app is unsure of this move. Show it on the board': 'Uygulama bu hamleden emin değil. Tahtada göster',
  'Show this diagram on the board': 'Bu diyagramı tahtada göster',
  'Play {san}': '{san} hamlesini göster',

  // Preparing a book
  'Opening the book': 'Kitap açılıyor',
  'Preparing the book: {percent}%': 'Kitap hazırlanıyor: %{percent}',
  'Reading the pages': 'Sayfalar okunuyor',
  'Recognizing the diagrams': 'Diyagramlar tanınıyor',
  'Finding the moves': 'Hamleler bulunuyor',
  'Working out the time left': 'Süre hesaplanıyor',
  'Almost done': 'Az kaldı',
  'Less than a minute left': 'Bir dakikadan az kaldı',
  'About a minute left': 'Yaklaşık 1 dakika kaldı',
  'About {minutes} minutes left': 'Yaklaşık {minutes} dakika kaldı',
  'You can read the pages meanwhile. The moves get their color when this is done.':
    'Bu sırada sayfaları okuyabilirsiniz. Bitince hamleler renklenecek.',
  'Ready: {moves} moves found. Click a colored move.': 'Hazır: {moves} hamle bulundu. Renkli bir hamleye tıklayın.',
  'Ready, but no moves were found in this book. You can still click its diagrams.':
    'Hazır, ama bu kitapta hamle bulunamadı. Diyagramlara yine de tıklayabilirsiniz.',
  'Preparing this book will stop, and start over next time.': 'Bu kitabın hazırlığı durur ve bir dahaki sefere baştan başlar.',
  'Leave the book': 'Kitaptan çık',
  'Stay here': 'Burada kal',

  // Errors
  'The analysis stopped unexpectedly.': 'Analiz beklenmedik şekilde durdu.',
  'This PDF could not be opened.': 'Bu PDF açılamadı.',
  'Please choose a PDF file.': 'Lütfen bir PDF dosyası seçin.',
  'Your corrections could not be saved.': 'Düzeltmeleriniz kaydedilemedi.',
  'This book could not be added to your library, so you will need to choose the file again next time.':
    'Bu kitap kitaplığınıza eklenemedi. Bir dahaki sefere dosyayı yeniden seçmeniz gerekecek.',
  'The copy of this book is gone. Remove it, then open the file again.':
    'Bu kitabın kopyası bulunamadı. Kitabı kaldırıp dosyayı yeniden açın.',

  // Panels
  'Click a move on the page to follow its line here.': 'Bir hamleye tıklayın, hamle dizisi burada görünsün.',
  'Nothing left to check.': 'Kontrol edilecek bir şey kalmadı.',
  'This diagram cannot be a real position': 'Bu diyagram gerçek bir pozisyon olamaz',
  'This diagram may be misread': 'Bu diyagram yanlış okunmuş olabilir',
  'This move may be misread': 'Bu hamle yanlış okunmuş olabilir',
  'A move here could not be read': 'Buradaki bir hamle okunamadı',
  'Page {page}: {reason}': '{page}. sayfa: {reason}',
  'Looks right': 'Doğru görünüyor',
  'And {count} more, shown as you clear these.': 've {count} tane daha. Bunları bitirdikçe görünür.',
  Move: 'Hamle',
  'Position in FEN notation': 'FEN gösterimiyle pozisyon',
  'Side to move': 'Sıra kimde',
  Save: 'Kaydet',
  'Use FEN piece letters and digits': 'FEN taş harflerini ve rakamları kullanın',
  'White king': 'Beyaz şah',
  'White queen': 'Beyaz vezir',
  'White rook': 'Beyaz kale',
  'White bishop': 'Beyaz fil',
  'White knight': 'Beyaz at',
  'White pawn': 'Beyaz piyon',
  'Black king': 'Siyah şah',
  'Black queen': 'Siyah vezir',
  'Black rook': 'Siyah kale',
  'Black bishop': 'Siyah fil',
  'Black knight': 'Siyah at',
  'Black pawn': 'Siyah piyon',
  'Analyze this book again to check how its pieces were recognized.': 'Taşların nasıl tanındığını görmek için kitabı yeniden analiz edin.',
  'The pieces as printed in this book. If a name is wrong, correct it and apply.':
    'Taşlar, bu kitapta basıldığı haliyle. Bir ad yanlışsa düzeltip uygulayın.',
  'Name of printed piece {number}': '{number}. taşın adı',
  'Apply and analyze again': 'Uygula ve yeniden analiz et',

  // AI tab
  'A model reads again the lines this app could not settle. Every move it reads is checked against the rules of chess and the words on the page.':
    'Bir yapay zekâ modeli, uygulamanın emin olamadığı satırları yeniden okur. Okuduğu her hamle satranç kurallarıyla ve sayfadaki yazıyla karşılaştırılır.',
  Change: 'Değiştir',
  'Using ChatGPT plan.': 'ChatGPT planı kullanılıyor.',
  'Manage usage': 'Kullanımı yönet',
  'Open Settings': 'Ayarları aç',
  'Which lines': 'Hangi satırlar',
  'Only lines with something in doubt': 'Yalnızca şüpheli satırlar',
  'All lines, which also catches unflagged errors': 'Tüm satırlar, işaretlenmemiş hataları da yakalar',
  'Working out what needs reading…': 'Nelerin okunması gerektiğine bakılıyor…',
  '{jobs} stretches of text, about {images} images': '{jobs} metin parçası, yaklaşık {images} görsel',
  'This uses what your ChatGPT plan includes. A long book can reach its limit, and you can continue later.':
    'Bu işlem ChatGPT planınızın kullanım hakkından düşer. Uzun bir kitap limite takılabilir, sonra devam edebilirsiniz.',
  'No price known for this model. About {input} tokens in and {output} out.':
    'Bu modelin fiyatı bilinmiyor. Yaklaşık {input} giriş, {output} çıkış jetonu.',
  'Estimated cost: {cost}, at prices from October 2026. It can differ.': 'Tahmini maliyet: {cost}, Ekim 2026 fiyatlarıyla. Farklı olabilir.',
  'under $0.01': '0,01 $ altında',
  'What is left was already read in this session, with no improvement.': 'Kalanlar bu oturumda zaten okundu, iyileşme olmadı.',
  'Nothing here needs reading.': 'Okunması gereken bir şey yok.',
  '{count} stretches run over too many pages to send, and are left out.': '{count} parça göndermek için fazla sayfaya yayılıyor, dışarıda bırakıldı.',
  'Send images of these parts of the pages to {destination}. Their terms apply. Only do this with a book you may share this way.':
    'Sayfaların bu kısımlarının görüntüleri {destination} tarafına gönderilsin. Onların şartları geçerlidir. Bunu yalnızca bu şekilde paylaşabileceğiniz bir kitapla yapın.',
  'Read with AI': 'Yapay zekâyla oku',
  Stop: 'Durdur',
  'Your AI settings changed, so reading stopped. What was already read is kept.':
    'Yapay zekâ ayarlarınız değişti, okuma durdu. Okunan kısım korunuyor.',
  'AI reading stopped unexpectedly.': 'Yapay zekâ okuması beklenmedik şekilde durdu.',
  'The text could not be read.': 'Metin okunamadı.',
  'Read {done} of {total}': 'Okunan: {done} / {total}',
  'Stopped after {done} of {total}': 'Durdu: {done} / {total}',
  'Finished all {total}': '{total} parçanın tamamı bitti',
  '{count} lines replaced': '{count} satır değiştirildi',
  '{moves} moves read: {confirmed} also found on the page, {flagged} added to Check':
    '{moves} hamle okundu: {confirmed} tanesi sayfada da bulundu, {flagged} tanesi Kontrol\'e eklendi',
  '{count} left as they were': '{count} tanesi olduğu gibi bırakıldı',
  '{count} failed': '{count} tanesi başarısız oldu',
  '{count} failed. Latest: {problem}': '{count} tanesi başarısız oldu. Son hata: {problem}',
  '{input} tokens in, {output} out': '{input} giriş, {output} çıkış jetonu',
  '{input} tokens in, {output} out, about {cost}': '{input} giriş, {output} çıkış jetonu, yaklaşık {cost}',

  // Settings
  Language: 'Dil',
  'AI reading': 'Yapay zekâ okuması',
  'Optional. A model can read again the lines this app could not settle, using your own account.':
    'İsteğe bağlı. Bir model, uygulamanın emin olamadığı satırları sizin hesabınızla yeniden okuyabilir.',
  Provider: 'Sağlayıcı',
  'Address of an OpenAI-compatible API': 'OpenAI uyumlu API adresi',
  Model: 'Model',
  'Model, which must be able to read images': 'Model (görsel okuyabilmeli)',
  '{provider} API key': '{provider} API anahtarı',
  '{provider} API key, if this server needs one': '{provider} API anahtarı (bu sunucu gerektiriyorsa)',
  'Remember my keys on this computer. If you leave this off, they last until you close the app. They are saved encrypted, but someone with access to your computer account could still recover them, so do not use this on a shared computer.':
    'Anahtarlarımı bu bilgisayarda hatırla. İşaretlemezseniz uygulama kapanana kadar geçerlidir. Şifreli saklanırlar, ama bilgisayar hesabınıza erişen biri yine de çıkarabilir. Ortak bilgisayarda kullanmayın.',
  'Still needed: {problem}': 'Eksik: {problem}',
  'Ready. You will still confirm what is sent each time, on the AI tab of a book.':
    'Hazır. Neyin gönderileceğini yine her seferinde kitabın Yapay zekâ sekmesinde onaylarsınız.',
  'Forget all keys': 'Tüm anahtarları unut',
  Done: 'Tamam',

  // ChatGPT plan
  'Use your ChatGPT plan': 'ChatGPT planınızı kullanın',
  "This needs the app's local helper, which runs when the app is started with npm run dev.":
    'Bunun için uygulamanın yerel yardımcısı gerekir. O da uygulama npm run dev ile başlatıldığında çalışır.',
  "You're using your ChatGPT plan": 'ChatGPT planınızı kullanıyorsunuz',
  'AI reading in this app will use your ChatGPT plan. You can manage usage in ChatGPT settings.':
    'Bu uygulamadaki yapay zekâ okuması ChatGPT planınızı kullanacak. Kullanımı ChatGPT ayarlarından yönetebilirsiniz.',
  'Got it': 'Anladım',
  'Complete AI reading with the usage included in your ChatGPT Plus or Pro plan, with no API key.':
    'Yapay zekâ okumasını API anahtarı olmadan, ChatGPT Plus veya Pro planınızın kullanım hakkıyla yapın.',
  'Use another account': 'Başka hesap kullan',
  'Connected.': 'Bağlı.',
  'Connected as {email}.': '{email} olarak bağlı.',
  'This app does not have permission to use your plan yet.': 'Bu uygulamanın planınızı kullanma izni henüz yok.',
  'Allow plan use': 'Plan kullanımına izin ver',
  'Sign out': 'Çıkış yap',
  'Finish signing in in your browser, then come back here.': 'Tarayıcınızda girişi tamamlayıp buraya dönün.',
  Cancel: 'İptal',

  // Provider names and setup messages from settings
  Other: 'Diğer',
  'ChatGPT plan, no API key': 'ChatGPT planı, API anahtarı yok',
  'Ollama, on this computer': 'Ollama, bu bilgisayarda',
  'OpenAI, using your ChatGPT plan': 'OpenAI (ChatGPT planınızla)',
  'an address you have not set': 'henüz girmediğiniz bir adres',
  'Sign in with your ChatGPT account.': 'ChatGPT hesabınızla giriş yapın.',
  'Allow this app to use your ChatGPT plan.': 'Bu uygulamanın ChatGPT planınızı kullanmasına izin verin.',
  'Choose a model.': 'Bir model seçin.',
  'Set the address of the service.': 'Servisin adresini girin.',
  'Set the model to use.': 'Kullanılacak modeli girin.',
  'Add your API key.': 'API anahtarınızı ekleyin.',
  'This is not a web address.': 'Bu bir web adresi değil.',
  'Use an https address, or http on this computer only.': 'https adresi kullanın. http yalnızca bu bilgisayar için geçerlidir.',
  'This could not be saved. It will work until you close the app.': 'Bu kaydedilemedi. Uygulama kapanana kadar çalışır.',
  'Your saved keys could not be removed from this computer. Please try again.': 'Kayıtlı anahtarlarınız bu bilgisayardan silinemedi. Lütfen yeniden deneyin.',
  'Your saved settings could not be read. Changes here will last until you close the app.':
    'Kayıtlı ayarlarınız okunamadı. Buradaki değişiklikler uygulama kapanana kadar geçerlidir.',

  // Messages from providers and the local helper
  'The provider did not accept this key.': 'Sağlayıcı bu anahtarı kabul etmedi.',
  'The provider does not offer this model.': 'Sağlayıcı bu modeli sunmuyor.',
  'The provider does not offer this model, or the address is wrong.': 'Sağlayıcı bu modeli sunmuyor ya da adres yanlış.',
  'The provider is limiting requests.': 'Sağlayıcı istekleri sınırlıyor.',
  'The provider could not be reached.': 'Sağlayıcıya ulaşılamadı.',
  'The provider could not be reached. It may be down, or not allow requests from this app.':
    'Sağlayıcıya ulaşılamadı. Kapalı olabilir ya da bu uygulamadan gelen isteklere izin vermiyor olabilir.',
  'The provider took too long.': 'Sağlayıcı çok geç yanıt verdi.',
  'The provider sent a reply that could not be read.': 'Sağlayıcının yanıtı okunamadı.',
  'The provider sent an empty reply.': 'Sağlayıcı boş yanıt gönderdi.',
  'The model declined to read this part.': 'Model bu kısmı okumayı reddetti.',
  'The reply was cut off.': 'Yanıt yarıda kesildi.',
  'The local sign-in helper could not be reached.': 'Yerel giriş yardımcısına ulaşılamadı.',
  'The local sign-in helper hit a problem.': 'Yerel giriş yardımcısında bir sorun oluştu.',
  'That request could not be understood.': 'Bu istek anlaşılamadı.',
  'That did not work. Please try again.': 'Bu olmadı. Lütfen yeniden deneyin.',
  'This account has no models to choose from.': 'Bu hesapta seçilebilecek model yok.',
  'The models could not be listed.': 'Modeller listelenemedi.',
  'You have reached a usage limit for your ChatGPT plan or for this app. What was read is kept. You can continue later, or see Manage usage.':
    'ChatGPT planınızın veya bu uygulamanın kullanım limitine ulaştınız. Okunan kısım korunuyor. Daha sonra devam edebilir ya da Kullanımı yönet bölümüne bakabilirsiniz.',
  'Your ChatGPT plan could not be checked just now.': 'ChatGPT planınız şu anda kontrol edilemedi.',
  'This ChatGPT account or workspace cannot use its plan in other apps.': 'Bu ChatGPT hesabı veya çalışma alanı planını başka uygulamalarda kullanamıyor.',
  'This model cannot do what AI reading needs, because it must be able to read images. Please choose another model in Settings.':
    'Bu model yapay zekâ okuması için uygun değil, çünkü görsel okuyabilmesi gerekiyor. Lütfen Ayarlar\'dan başka bir model seçin.',
  'OpenAI does not support this request on a ChatGPT plan.': 'OpenAI bu isteği ChatGPT planında desteklemiyor.',
  'OpenAI could not validate this ChatGPT account. Please check it in Settings.': 'OpenAI bu ChatGPT hesabını doğrulayamadı. Lütfen Ayarlar\'dan kontrol edin.',
  "OpenAI's permission check did not pass for this app.": 'Bu uygulama OpenAI izin kontrolünden geçemedi.',
  'OpenAI did not accept this sign-in. Please check the account in Settings.': 'OpenAI bu girişi kabul etmedi. Lütfen Ayarlar\'dan hesabı kontrol edin.',
  'OpenAI does not allow this request, which can depend on your region or account.': 'OpenAI bu isteğe izin vermiyor. Bu, bölgenize veya hesabınıza bağlı olabilir.',
  'OpenAI does not offer this model to your account. Please choose another in Settings.': 'OpenAI bu modeli hesabınıza sunmuyor. Lütfen Ayarlar\'dan başka bir model seçin.',
  'OpenAI is limiting requests.': 'OpenAI istekleri sınırlıyor.',
  'ChatGPT plan use is not available just now.': 'ChatGPT planı kullanımı şu anda mümkün değil.',
  'OpenAI sent an empty reply.': 'OpenAI boş yanıt gönderdi.',
  'The reply from OpenAI stopped before it finished.': 'OpenAI yanıtı bitmeden kesildi.',
  'OpenAI took too long to reply.': 'OpenAI çok geç yanıt verdi.',
  'OpenAI could not be reached.': 'OpenAI\'a ulaşılamadı.',
  'The ChatGPT sign-in could not be renewed.': 'ChatGPT girişi yenilenemedi.',
  'The ChatGPT sign-in could not be renewed just now. Please try again soon.': 'ChatGPT girişi şu anda yenilenemedi. Lütfen birazdan yeniden deneyin.',
  'Please sign in with ChatGPT in Settings.': 'Lütfen Ayarlar\'dan ChatGPT ile giriş yapın.',
  'Please sign in with ChatGPT again.': 'Lütfen ChatGPT ile yeniden giriş yapın.',
  'This app no longer has permission to use your ChatGPT plan. Please allow it in Settings.': 'Bu uygulamanın artık ChatGPT planınızı kullanma izni yok. Lütfen Ayarlar\'dan izin verin.',
  'Your ChatGPT sign-in has ended. Please sign in again.': 'ChatGPT girişinizin süresi doldu. Lütfen yeniden giriş yapın.',
  'Your ChatGPT sign-in has ended. Please sign in again in Settings.': 'ChatGPT girişinizin süresi doldu. Lütfen Ayarlar\'dan yeniden giriş yapın.',
  'OpenAI no longer accepts this app\'s registration. Please choose "Use another account" to register it again.':
    'OpenAI artık bu uygulamanın kaydını kabul etmiyor. Yeniden kaydetmek için "Başka hesap kullan" seçeneğini kullanın.',
  'The sign-in took too long. Please try again.': 'Giriş çok uzun sürdü. Lütfen yeniden deneyin.',
  'The sign-in was declined, so your ChatGPT plan was not connected.': 'Giriş reddedildi, bu yüzden ChatGPT planınız bağlanmadı.',
  'OpenAI could not complete the sign-in. Please try again.': 'OpenAI girişi tamamlayamadı. Lütfen yeniden deneyin.',
  'OpenAI sent no sign-in code. Please try again.': 'OpenAI giriş kodu göndermedi. Lütfen yeniden deneyin.',
  'The registration was not completed. Please try again.': 'Kayıt tamamlanmadı. Lütfen yeniden deneyin.',
  'OpenAI returned a different app registration, so it was not used.': 'OpenAI farklı bir uygulama kaydı döndürdü, bu yüzden kullanılmadı.',
  'The sign-in could not be completed. Please try again.': 'Giriş tamamlanamadı. Lütfen yeniden deneyin.',
  "OpenAI's signing keys could not be fetched. Please try again.": 'OpenAI imza anahtarları alınamadı. Lütfen yeniden deneyin.',
  "OpenAI's reply could not be verified, so it was not used.": 'OpenAI yanıtı doğrulanamadı, bu yüzden kullanılmadı.',
  'OpenAI did not accept the sign-in. Please try again.': 'OpenAI girişi kabul etmedi. Lütfen yeniden deneyin.',
  'That is a different ChatGPT account. Choose "Use another account" to add it.': 'Bu farklı bir ChatGPT hesabı. Eklemek için "Başka hesap kullan" seçeneğini kullanın.',
  'You are signed out here, but OpenAI did not confirm it. You can disconnect this app in ChatGPT settings.':
    'Burada çıkış yapıldı, ama OpenAI bunu doğrulamadı. Bu uygulamanın bağlantısını ChatGPT ayarlarından kesebilirsiniz.',
  'Only this app may use this helper.': 'Bu yardımcıyı yalnızca bu uygulama kullanabilir.',
  'No such request.': 'Böyle bir istek yok.',
  'The reply held no JSON': 'Yanıtta JSON yok',
  'The reply held no lines': 'Yanıtta satır yok',
  'The reply has a line with no moves': 'Yanıtta hamlesiz bir satır var',
  'This part of the page could not be drawn.': 'Sayfanın bu kısmı çizilemedi.',
  'Close the other windows of this app, then try again.': 'Bu uygulamanın diğer pencerelerini kapatıp yeniden deneyin.',
  'The change could not be saved.': 'Değişiklik kaydedilemedi.',
  'pawn on the first or last rank': 'ilk veya son sırada piyon var',
} as const;

export type MessageKey = keyof typeof TURKISH;
export type Language = 'tr' | 'en';
export type MessageParams = Readonly<Record<string, string | number>>;

export const LANGUAGES: readonly { id: Language; name: string }[] = [
  { id: 'tr', name: 'Türkçe' },
  { id: 'en', name: 'English' },
];

const fill = (text: string, params?: MessageParams) =>
  params ? text.replace(/\{(\w+)\}/g, (whole, name: string) => (name in params ? String(params[name]) : whole)) : text;

const lookup = (language: Language, text: string): string | undefined =>
  language === 'tr' ? (TURKISH as Readonly<Record<string, string>>)[text] : text;

/** The app's own words, which the compiler checks against the list above. */
export function translate(language: Language, key: MessageKey, params?: MessageParams): string {
  return fill(lookup(language, key) ?? key, params);
}

const REQUEST_NOTE = /\s*\(request ([^)]+)\)(?=\.?$)/;
const CODED_ERRORS: readonly [RegExp, string][] = [
  [/^white king count is (\d+)$/, 'beyaz şah sayısı $1'],
  [/^black king count is (\d+)$/, 'siyah şah sayısı $1'],
  [/^more than 8 white pawns$/, '8\'den fazla beyaz piyon var'],
  [/^more than 8 black pawns$/, '8\'den fazla siyah piyon var'],
  [/^The provider returned an error \((.+)\)\.$/, 'Sağlayıcı bir hata döndürdü ($1).'],
  [/^OpenAI returned an error \((.+)\)\.$/, 'OpenAI bir hata döndürdü ($1).'],
  [/^The local sign-in helper sent a reply that could not be read \((.+)\)\.$/, 'Yerel giriş yardımcısının yanıtı okunamadı ($1).'],
  [/^OpenAI does not support part of this request on a ChatGPT plan \((.+)\)\.$/, 'OpenAI bu isteğin bir kısmını ChatGPT planında desteklemiyor ($1).'],
  [/^OpenAI does not support part of this request on a ChatGPT plan\.$/, 'OpenAI bu isteğin bir kısmını ChatGPT planında desteklemiyor.'],
];

/**
 * A message that came from somewhere else, such as a provider or the local helper. Anything
 * not on the list stays as it is, since a message in English beats no message.
 */
export function translateMessage(language: Language, message: string): string {
  if (language === 'en') return message;
  const note = message.match(REQUEST_NOTE);
  const plain = note ? message.replace(REQUEST_NOTE, '') : message;
  const suffix = note ? ` (istek ${note[1]})` : '';
  const known = lookup(language, plain);
  if (known) return note ? known.replace(/\.$/, `${suffix}.`) : known;
  for (const [pattern, turkish] of CODED_ERRORS) {
    if (pattern.test(plain)) {
      const text = plain.replace(pattern, turkish);
      return note ? text.replace(/\.$/, `${suffix}.`) : text;
    }
  }
  return message;
}

/** True for a message written for readers, rather than a raw error from a library. */
export function isKnownMessage(message: string): boolean {
  const plain = message.replace(REQUEST_NOTE, '');
  return plain in TURKISH || CODED_ERRORS.some(([pattern]) => pattern.test(plain));
}

/** A remembered choice first, then the language the computer is set to. */
export function pickLanguage(stored: string | null, browser: string | undefined): Language {
  if (stored === 'tr' || stored === 'en') return stored;
  return browser?.toLowerCase().startsWith('tr') ? 'tr' : 'en';
}
