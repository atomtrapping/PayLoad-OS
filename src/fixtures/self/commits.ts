/**
 * Three commit objects from this repository's own object store, committed as
 * specimens so the parser has something real to read in a test that runs
 * anywhere.
 *
 * They are the bytes `git cat-file commit` returns, verbatim. Each carries the
 * object name git holds it under, and that name is checkable rather than
 * asserted: it is the SHA-1 of `commit <byte length>\0` followed by these
 * bytes, which is git's own rule and which the test recomputes. A specimen
 * whose name did not match its bytes would be a fixture pretending to be an
 * observation.
 *
 * The three are chosen for the shapes the grammar has to get right: a root
 * commit with no parent, a merge with two, and an ordinary commit with one.
 * All three are SSH-signed, so all three exercise the continuation lines that
 * carry a signature block inside a header.
 *
 * `beganAs: 'COMMITTED_SPECIMEN'` is the honest declaration for every one of
 * them. The parser cannot tell these from a live object-store read — the bytes
 * are identical — which is exactly why the declaration is required and never
 * inferred.
 */
import type { CaptureDeclaration } from '@/domain/selfObservation';

export interface CommitSpecimen {
  /** The name git holds these bytes under. Recomputable from the bytes; the test does.  */
  objectName: string;
  /** sha256 over exactly the bytes below, which is the digest an adapter would compute at capture. */
  bytesDigest: string;
  /** What `git cat-file commit <name>` returns. */
  bytes: string;
  shape: string;
}

export const SPECIMEN_DECLARATION: CaptureDeclaration = {
  repository: 'notationsystems/NotationsOS',
  readBy: 'git cat-file commit <name>',
  capturedAt: '2026-09-08T17:45:00.000Z',
  beganAs: 'COMMITTED_SPECIMEN',
};

export const COMMIT_SPECIMENS: readonly CommitSpecimen[] = [
  {
    objectName: '04311ada964c1bce639efbabc1015cf8844035be',
    bytesDigest: 'sha256:74b663c144cb46ba5636de20f143130d2100a777596c5ac6a9c3d9f255ca04ed',
    shape: 'A root commit: no parent header at all, which is a value and not an absence.',
    bytes: 'tree e17a20dd754fd619679aad556d347bfc6f0d79a2\nauthor Claude <noreply@anthropic.com> 1788524378 +0000\ncommitter Claude <noreply@anthropic.com> 1788524378 +0000\ngpgsig -----BEGIN SSH SIGNATURE-----\n U1NIU0lHAAAAAQAAADMAAAALc3NoLWVkMjU1MTkAAAAgrLzsfFISF4by8Q+FKz27YpkK1USsBB+m\n amu1QkJnbDsAAAADZ2l0AAAAAAAAAAZzaGE1MTIAAABTAAAAC3NzaC1lZDI1NTE5AAAAQNPft0mQ\n motGrCpGDmyayLwz/TcWzCmHG6oPaAHKnDBUCjHFJOzLIc4F6cY/Ci1ZP0urVq6PCLeAUJda0m9r\n vAg=\n -----END SSH SIGNATURE-----\n\nScaffold Payload OS: Next.js 16 shell, token layer, navigation\n\nMirror the Payload Terminal V0 stack (Next 16.2.6, React 19.2.4, Tailwind 4,\nVitest 2, ESLint 9) with jsdom + Testing Library for semantic component\ntests and Playwright + axe for end-to-end checks. Token layer derives from\nTerminal\'s void/gold/mono language without glass, glow or animation, adds\nstatus, assurance, check and focus tokens, and a print stylesheet. Shell:\nskip link, primary navigation (Cases, Rulings, Evidence, Replay, Profiles,\nAPI), and a small vertical context with Caravan active and Tradewind and\nLandshark as disabled module slots.\n\nCo-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>\nClaude-Session: https://claude.ai/code/session_01YavvFTG3jpkFTZgGR3Zgq9\n',
  },
  {
    objectName: '4b72e057f5b36cbd0a9cbe19f4b60853b4a11dfe',
    bytesDigest: 'sha256:ca065b78b32bbda08ed92dfa21e761fd5cedb0cbd463978b6807d3a7cab76973',
    shape: 'A merge: two parent headers, which repeat legitimately and are therefore not ambiguity.',
    bytes: 'tree 90af0d8f70bdf8ec84a6ac17d346a733f0677c98\nparent e4c20f5d2a3c5fa6089f6e7a21f5092351c73c3b\nparent ae0a6970e2ee3531dcddcb009ba65cf5bd6549f6\nauthor Claude <noreply@anthropic.com> 1788838381 +0000\ncommitter Claude <noreply@anthropic.com> 1788838381 +0000\ngpgsig -----BEGIN SSH SIGNATURE-----\n U1NIU0lHAAAAAQAAADMAAAALc3NoLWVkMjU1MTkAAAAgrLzsfFISF4by8Q+FKz27YpkK1USsBB+m\n amu1QkJnbDsAAAADZ2l0AAAAAAAAAAZzaGE1MTIAAABTAAAAC3NzaC1lZDI1NTE5AAAAQIC/lhtf\n yUQKc9pDUjDje/mA5RG+8vpeAwqmZyytrVFsweAx0d3Wk1DBZ7qpzIN3HvFQAKv19U6tw8QyFgeJ\n lwI=\n -----END SSH SIGNATURE-----\n\nMerge remote-tracking branch \'origin/claude/payload-os-frontend-cm3d22\' into claude/payload-os-frontend-cm3d22\n',
  },
  {
    objectName: '249bc4ae3734fb4e8be1f553c63d41a87fff83ff',
    bytesDigest: 'sha256:0e442ce1f2ffb53a6e9c9d3de8287039ea05cd4a9ebb106c39deedd2470fdbe7',
    shape: 'An ordinary commit: one parent.',
    bytes: 'tree 48358a9afa577dfe3e74d5cc60100b0ecd891b01\nparent 03336640648fab67394966053c04c0e642346960\nauthor Claude <noreply@anthropic.com> 1788888751 +0000\ncommitter Claude <noreply@anthropic.com> 1788888751 +0000\ngpgsig -----BEGIN SSH SIGNATURE-----\n U1NIU0lHAAAAAQAAADMAAAALc3NoLWVkMjU1MTkAAAAgrLzsfFISF4by8Q+FKz27YpkK1USsBB+m\n amu1QkJnbDsAAAADZ2l0AAAAAAAAAAZzaGE1MTIAAABTAAAAC3NzaC1lZDI1NTE5AAAAQIHFcjFw\n x7lD5VYdhIhK18a6tSo4n/87h6Rr5qkw7aT6e6Z9/rb1csraw0ai5A0hesmvUT3g72r+rUpEbZY2\n SAw=\n -----END SSH SIGNATURE-----\n\nRead the camera height in a unit that does not sit on a rounding boundary\n\nAdmitted records remain 0.\n\nTWO MACHINES, ONE VIEW, TWO READOUTS\n\nCI\'s browser job failed one test at desktop and mobile, and it was a real\ndefect rather than a flake:\n\n  Expected substring: "51.9497°, 4.0250° · 4 km"\n  Received string:    "51.9497°, 4.0250° · 3 km"\n\nThe Earth twin\'s camera readout was Math.round(height / 1000) kilometres.\nEvery placement height this application produces is a stated uncertainty\ntimes fourteen, and the Rotterdam position states ±250 m — so the camera\nsits at exactly 3,500 m, which is 3.5 km, the one value where the rounded\nanswer depends on whether the live camera settles at 3500.02 or 3499.98\nafter its flight. This machine read 4 km. The runner read 3 km. Both are\nthe same view.\n\nUnder ten kilometres the reading is in metres now, which is the unit\nplacementHeightM works in and is nowhere near a boundary; at or above it,\nwhole kilometres, where a metre is noise. 3,500 m and 7,000 m for the two\nplacements; 70 km, 1,200 km and 12,000 km unchanged.\n\nThis is better than making the assertion tolerant. An instrument that\nrounds a 3.5 km camera to 4 km has thrown away exactly the precision that\nmakes the number worth showing: the height is derived from the claim\'s own\nstated uncertainty, which is the whole reason the camera is where it is.\nA reader who cannot see 3,500 cannot see that.\n\nNine unit tests over the label, including both sides of the float noise\nthat produced the disagreement, the switch at ten kilometres, and every\nheight the placement frame can produce.\n\nVerified: cargo test 29 passed, tsc 0, eslint 0 at --max-warnings=0,\n4886 unit tests across 200 files, next build 0, 210 browser tests at\ndesktop and Pixel 7, screenshots regenerated.\n\nCo-Authored-By: Claude Opus 5 <noreply@anthropic.com>\nClaude-Session: https://claude.ai/code/session_01YavvFTG3jpkFTZgGR3Zgq9\n',
  },
] as const;
