# Attributions

## Dungeons & Dragons System Reference Document 5.1

Portions of Deepgilt's game **data** — specific monster stat blocks and certain
spell/skill values — are derived from the **System Reference Document 5.1**
("SRD 5.1") by **Wizards of the Coast LLC**.

The SRD 5.1 is licensed under the **Creative Commons Attribution 4.0 International
License** (CC-BY-4.0):
<https://creativecommons.org/licenses/by/4.0/legalcode>

Official SRD source: <https://dnd.wizards.com/resources/systems-reference-document>

**Changes were made.** The SRD content used here has been modified for Deepgilt —
renamed, re-flavored, and numerically transformed (CR / HP / AC / damage remapped
to Deepgilt's real-time combat model). Every derived record is tagged with an
inline `_srd` block in the data files (`data/monsters.json`, `data/skills/*.json`)
that records the original SRD values and the exact per-entry transform, so the
lineage is auditable.

This attribution does **not** imply that Wizards of the Coast endorses Deepgilt or
its use of the SRD.

### What is NOT used

Deepgilt's names, lore, classes, art, and the remainder of its data are **original**
and are not part of the SRD. No Dungeons & Dragons **Product Identity** is used —
no excluded creatures (e.g. beholder, mind flayer, displacer beast, githyanki,
slaad, umber hulk), no named characters or deities, and no official settings.
Only generic, public-domain creature types (skeletons, zombies, ghouls, etc.) are
drawn from the SRD.

### Separate from the engine's architectural reference

Deepgilt's *code* architecture is independently informed by OpenDiablo2 on a
clean-room basis (concepts only, never copied — see the engine docs). That is a
separate matter from this SRD data attribution: no OpenDiablo2 code and no
Blizzard Diablo assets or data are used.
