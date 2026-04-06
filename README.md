# React Highlight :: Demo

This is a simple React app that highlights the word(s) before '::' on each line in an editable text field.

## Features
- Editable textarea for input
- Highlights any word(s) before '::' on each line
- Live preview with highlighted text

## Usage
1. Run `npm install` in this folder to install dependencies.
2. Run `npm start` to launch the app.

## Example
```
person1::test
person2::example
```
In the preview, `person1` and `person2` will be highlighted.





todo:
- preview textbox outputs (route from server)
- import profiles from directus, pick and choose which to bring in
- import script using Google Drive link, automatically render to output folder with name based on the googl document
- show how many lines will be rendered as confirmation for render
- do validation check against existing profile base to see whether any lines will be skipped
- button to add custom snippets as an actual entry in the table  
- add option to parse profiles used in the script with syntax like "> character name"