# User Interface Contract: RIBRush

**Feature**: [spec.md](../spec.md)  
**Plan**: [plan.md](../plan.md)

This is the public interaction contract for the browser game. RIBRush exposes no
network API or server-side interface.

## Screens and states

- **Start**: presents the game, keyboard controls, and a start action.
- **Briefing**: explains the level rule or rule mix and worked example; the
  Level 1 briefing introduces LPM, then AD, then metric; Enter begins play.
- **Playing**: shows level, packet number, score, lives, pressure, destination,
  matching routes, and selected next hop.
- **Feedback**: reports correctness, the selected and winning route, the
  deciding criterion, and the compared values.
- **Paused**: freezes packet motion and provides resume and restart actions.
- **Summary**: reports score, levels completed, correct/wrong/missed counts,
  remaining lives, and replay.
- **Error**: explains invalid authored/generated content and offers retry or
  return to start without treating it as a player error.

## Keyboard contract

| Input | Effect |
| --- | --- |
| Left / Right Arrow | Move the visible selection among candidate next hops |
| Enter | Start from the start/briefing screen; submit the selected next hop while playing; continue from feedback |
| Escape | Pause while playing; resume from the pause screen |

The selected next hop is visibly focused and named in text. A decision is
submitted once. Repeated Enter after resolution cannot double-score or
double-penalize. No core action requires a pointer or touch.

## Outcome contract

Every resolved decision displays whether it was correct, the selected route,
the winning route, the rule that decided the outcome, and the relevant values.
Color and animation may reinforce this information but cannot replace text.
Invalid input and content errors are distinct from an incorrect route choice.

## Accessibility and feedback

- Keyboard focus is visible and follows the screen's interaction order.
- Feedback is readable as text and announced to assistive technology.
- Reduced-motion mode preserves all information and controls.
- Sound is optional, starts after a user gesture, and can be muted.
- Status is not conveyed by color alone; color use follows the approved palette.
