# Documentation for the Littering Detection System

This folder contains the documentation for the system. The system detects suspected littering incidents from video. It is a minor project for Purwanchal Campus, IOE, Tribhuvan University.

## The files in this folder

Read the files in this order:

| File | Topic |
| --- | --- |
| 01-overview.md | What the system does and its main parts |
| 02-architecture.md | The structure of the system and the data flow |
| 03-how-the-code-works.md | How each part of the code works |
| 04-datasets.md | The datasets that the system uses |
| 05-installation.md | How to install and start the system |
| 06-user-guide.md | How to use the dashboard |
| 07-api-reference.md | The API endpoints and their use |
| 08-testing.md | How to test the system |
| 09-validation.md | How to validate the system |
| 10-troubleshooting.md | Problems and their fixes |
| 11-limitations.md | The known limits of the system |

## The writing standard

These documents follow the ASD-STE100 Simplified Technical English standard. This standard is also known as STE. The standard is a controlled form of English for technical documents.

The main rules that this documentation follows are:

- Use short sentences.
- Use the active voice.
- Use one instruction per sentence in procedures.
- Use the present tense for descriptions.
- Use the imperative form for instructions.
- Use one meaning for one word.
- Do not use contractions.
- Do not use vague words such as "etc." or "e.g.".
- Write "for example" instead of "e.g.".
- Use "must" for requirements.
- Use "can" for possibility.
- Use "may" for permission.
- Use the same term for the same item through all documents.

## Terms that this documentation uses

| Term | Meaning |
| --- | --- |
| the system | The complete software product |
| the server | The FastAPI application |
| the dashboard | The web page for the operator |
| video | A video file |
| frame | One image in a video |
| incident | A suspected littering event |
| snapshot | One saved image of an incident |
| clip | A short saved video of an incident |
| confidence | The confidence score of an incident |
| model | The trained neural network |
| weight | The model file that contains the trained values |
| queue | The list of videos that wait for processing |
| record | One row in the database |
| status | The state of a video or an incident |
| review | To examine an incident and mark its result |

## How to find more information

The README.md file in the project root gives a short introduction. The code in the source folders gives the complete implementation.
