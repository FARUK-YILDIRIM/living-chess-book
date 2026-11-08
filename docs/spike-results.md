# Accuracy on a real book

These numbers were measured before the code was first published, on commits that are not part
of the published history. Each section gives the date instead.

Measured on 2026-11-05, on one scanned book of 284 pages with an OCR
text layer and figurine notation. This is a hard case. The book is not in the repository,
and these aggregate numbers are all that is recorded about it (see ADR-0008).

**On a digital book, the local reader now meets the accuracy target on pages kept apart from
tuning. On this scanned book it does not. With AI reading, the scanned book's main lines met it
on a small sample, which still has to be confirmed against a real API.**

## Moves

Lines were read by eye from the page images and compared with the app's main lines.

| Set | Lines | Moves | Correct | Missing | Wrong, flagged | Wrong, not flagged | Perfect lines |
|---|---|---|---|---|---|---|---|
| Used for tuning | 10 | 180 | 136 (75.6%) | 44 | 11 | 1 | 4 |
| **Never used for tuning** | 8 | 125 | **64 (51.2%)** | 61 | 12 | 13 | 1 |

Trust the second row. It was measured once, after the code was frozen, on randomly
chosen pages. The gap between the rows shows how much the tuning overfitted. Eight lines
is also a small sample, and the app found only 6 of them.

The target was 95% correct or flagged. "Wrong, not flagged" is the most serious column,
because a reader has no warning of those moves.

## Moves with AI reading

Measured on 2026-11-05, on the same book and the same two sets. The app's
prompts and images were given to Claude models running as Claude Code subagents, and their
replies went through the app's own checks. Each subagent opened only its prompts and images.

| Set | Reader | Moves | Correct | Missing | Wrong, flagged | Wrong, not flagged | Perfect lines |
|---|---|---|---|---|---|---|---|
| Used for tuning the local reader | Opus | 180 | 180 (100%) | 0 | 0 | 0 | 10 of 10 |
| Used for tuning the local reader | Haiku | 180 | 180 (100%) | 0 | 0 | 0 | 10 of 10 |
| **Never used for tuning** | Local only | 125 | 64 (51.2%) | 61 | 12 | 13 | 1 of 8 |
| **Never used for tuning** | Opus | 125 | **124 (99.2%)** | 1 | 1 | 0 | 7 of 8 |
| **Never used for tuning** | Haiku | 125 | **124 (99.2%)** | 1 | 1 | 0 | 7 of 8 |

The second row group was scored after the code was frozen, and nothing changed afterwards.
Haiku reached its number with the app's second look at illegal moves: it had 120 before that.
This meets the 95% target on this sample, but read these limits first:

- **No real API call has been made.** No provider was available, so neither adapter has run
  against a real service, and the request shapes are checked only with a stand-in server and
  stubbed responses. Subagents also run with different settings from the app's requests.
- **The reference is not independent.** The hand-checked lines were read from the same page
  images by a Claude model, not by a person, so an error both would make goes unseen. A
  person should check a sample.
- **The sample is small and from one book**, with crisp print and bold main lines. 18 lines
  or 305 moves say little about books that print main lines differently.
- **Only main lines were measured.** Side lines are not read by the model.

About 1 move in 7 had no matching OCR word (18 of 125 for Opus), and those stay in the Check
tab. On this book, flagged lines come to 202 stretches of text. 2 more run over too many pages
and are left out. The app's estimate for those 202 is about $5.87 with Opus 5.5, $2.94 with
Sonnet 5.5 and $0.15 with Haiku 5.5, from an assumed reply length and not from a real bill.

## Moves in a digital book

Measured on 2026-11-05, on one digitally typeset book of 212 pages, in
algebraic notation with a chess font, as a reader would upload it. The book is not in the
repository, and the app does not ship with it.

The reference comes from the book's own LaTeX source, so unlike the scanned book's, no model
read it. Moves are compared in reading order over the whole page range, so a game split at its
diagrams into several clickable lines still counts in full.

| Pages | Reference moves | Reader | Correct | Missing | Wrong, flagged | Wrong, not flagged |
|---|---|---|---|---|---|---|
| Used for tuning | 1,734 | Before | 148 (8.5%) | 1,586 | 7 | 4 |
| Used for tuning | 1,734 | Now | 1,552 (89.5%) | 182 | 20 | 24 |
| **Never used for tuning** | 899 | Before | 1 (0.1%) | 898 | 1 | 1 |
| **Never used for tuning** | 899 | Now | **869 (96.7%)** | 30 | 3 | 6 |

The kept-apart pages were first measured with the code frozen. Later fixes, made because of a
browser failure and not by looking at those pages, left the figure unchanged. They are all
played-out games, which are easier than the tuning pages' short examples and prose, so 96.7%
should not be read as the figure for a whole book. One book says little about others.

**These figures come from the command line. The browser reads pages differently.** On this book
the browser's rendering once made a white queen look black, which gave every diagram an
impossible position, so the app found no moves at all while the command line reported good
figures. After the fix, the browser finds 2,908 moves against the command line's 2,945, with the
same 14 invalid diagrams and all known positions exact. Its moves have not been scored one by
one. A book should be tried in the browser as well as measured.

All 45 positions with a known FEN in the source were found exactly among the diagrams. 14 of
203 diagrams failed the position checks, and the rest of the 203 were not compared. Analysis
took about 3 minutes in Node. The Check tab held 123 items.

The same changes on the scanned book, on the command line only: 56% on its kept-apart lines (was
51.2%), with 15 wrong and unflagged moves (was 13), and no change on its tuning lines. Those lines had been measured
before, though not used for tuning. Analysis went from about 8.5 to 10 minutes.

## A real provider

Measured on 2026-11-05 with DeepSeek's `deepseek-flash`, the first real API this project has run
against. The figures below are small samples from one model. Run the coach's with
`scripts/eval-coach.ts`, on positions of the project's own.

**Coach, 12 questions.** All were answered. A person read every reply, because passing the
automatic checks says little. The first round found what no check would have:

- Asked with no engine lines, it said material was level in a position where Black was a knight
  down. The prompt now gives counted material, and the same question then gave the right count.
- Plan moves in its sentences, such as `...O-O` for later, were struck through as illegal in three
  answers of twelve. They are now marked only as not playable now, and a warning needs a bad line.
- Asked "what if I play a6?", it could only say that a6 had not been calculated. The engine now
  looks at moves named in a question, and it then gave the score.
- It mixed English words into Turkish, and a hint all but named the move. Both were reduced by
  changing the instructions.

In the second round: no illegal engine moves, no hint named its move, and an instruction hidden in
page text was ignored and reported. Replies took 13 seconds on average and up to 34, and 78 in the
first round. Twelve questions cost at most $0.03. The model still bracketed two moves already
played, and one move after a move of its own. Nobody strong at chess has checked the advice, so
this says nothing yet about how good it is.

**In the app.** Asked on screen, through a small relay on this computer so that the key was in no
field of the app, it answered in 10 to 20 seconds, its moves could be clicked onto the board, and it
used the engine's score for a move named in the question. This showed two more things: Markdown
appeared as stray marks, and square names such as "the a3 square" became clickable moves. Both are
fixed. One answer also called a pawn isolated when it was not, which no check here can catch.
DeepSeek's own setting was tried from the browser with a made-up key, which it refused, and the app
said so and kept the question. So that setting has not yet carried a real answer in the browser.

**AI reading, 12 of the 71 doubtful stretches of the digital book above**, chosen evenly through
it, with real pictures of the pages. That book is out of copyright.

| | Correct of 2,633 | Missing | Wrong, flagged | Wrong, not flagged |
|---|---|---|---|---|
| Before | 2,421 (91.9%) | 212 | 23 | 31 |
| After | 2,437 (92.6%) | 196 | 24 | 32 |

Of the 112 moves it read, 106 were also found in the words of the page. It took 194 seconds and at
most $0.11. It wrote about 7,200 tokens for each stretch, because it thinks at length, against the
1,000 the estimate assumed, so the estimate now allows for that. This is not the scanned book, where
AI reading matters most, as that book's pages should not go to a service without its owner's say.

**AI reading on the scanned book**, with the owner's consent, through the app's own prompts and
checks, on the same hand-checked lines as the table under "Moves with AI reading". This is the first
real measure of that table's claim, which came from stand-ins.

| Set | Reader | Moves | Correct | Missing | Wrong, flagged | Wrong, not flagged | Perfect lines |
|---|---|---|---|---|---|---|---|
| Never used for tuning | Local only | 125 | 64 (51.2%) | 61 | 12 | 13 | 1 of 8 |
| Never used for tuning | `deepseek-flash`, first reading | 125 | 92 (73.6%) | 33 | 5 | 11 | 5 of 8 |
| Never used for tuning | `deepseek-flash`, with the second look at illegal moves | 125 | **109 (87.2%)** | 16 | 0 | 1 | 6 of 8 |
| Used for tuning | Local only | 180 | 136 (75.6%) | 44 | 11 | 1 | 4 of 10 |
| Used for tuning | `deepseek-flash`, with the second look | 180 | 167 (92.8%) | 13 | 8 | 0 | 8 of 10 |

So it helps a great deal, and falls short of the 95% target and of the 99.2% the stand-ins reached.
Limits and costs:

- One of the 26 requests failed with a reply that could not be read, and that stretch stayed as it
  was, so the 87.2% includes it. The cause was not found, and nothing retries such a failure.
- The reference was read by a Claude model, not by a person, which may favor Claude's own stand-ins.
  The local-only figures come from the analysis stored at that time. The reader has since reached 56%
  on the first set, which matters little for lines that AI reading replaces.
- All 20 stretches and 6 second looks cost at most $0.19 at peak prices, and took about 50 seconds a
  stretch, one at a time. By those figures the book's 202 doubtful stretches would cost about $2 at
  peak prices, but take nearly three hours, so reading them side by side matters more than price.
  The measuring script read one at a time. The app reads three at a time, which would make it about an
  hour, though this has not been timed on a whole book.

## Diagrams

| Measure | Result |
|---|---|
| Boards found | 233 |
| Pass the position checks | 231 |
| Same as a separate hand-labelled reading, where both found the board | 222 of 222 |
| Random boards from the hand-labelled reading checked by eye | 11 of 12 exact; the other was flagged |

Piece names were worked out with no human labels. The comparison shows that the
automatic and hand-labelled readings agree, not that either is always right. How many
boards were missed altogether has not been measured.

On the three-diagram sample book, one white bishop on a dark square can be read as a rook.
Books with few diagrams give the app little to learn from.

## Speed and review load

| Measure | Result |
|---|---|
| Reading all pages | 10 seconds |
| Analysis, in Node on the development Mac | about 8.5 minutes |
| Moves found | 3,051 |
| Marked low confidence | 629 |
| Items in the Check tab | 917 |

917 items is too many for one reader to check.

## What this does and does not show

- Clicking moves and diagrams works, and diagrams are promising.
- Reading moves automatically is not reliable enough on a damaged OCR layer.
- Nothing has been measured on a digital PDF of a real book, whose text layer should be
  far cleaner. Only generated PDFs have been tried, and they say little about real books.

## Known causes, from the tuning lines

- Bold print marks main lines, but is measured from a scan, so main and side lines get
  mixed up.
- Damaged symbols can still fit a legal but wrong move.
- A line is lost when too little of it can be read, or when its first moves come from
  before the diagram.
