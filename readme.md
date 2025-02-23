# Barely Transcendent

## Devcontainer

This repository contains at it's root the development container configuration for Barely Transcendent's Django project. The devcontainer setup (located in the `.devcontainer` folder at the repository root) makes it easy to get up and running with all the necessary tools and configurations.

### 1. Clone the Repository

Clone the repo to your local machine using:

```bash
git clone git@github.com:bazuara/Barely-Transcendent.git
cd Barely-Transcendent
```
### 2. Open the folder on Visual Studio Code
* Open the folder with vscode using:

```bash
code .
```
* Visual Studio Code should promt you to `Reopen in Container` with a menu down right. If it doesn't, use your command palette to run `Dev Containers: Rebuild and Reopen in Container`
* Wait until your vscode changes the theme and install all plugins. Don't worry, all this congif only applies to the container.

### 3. Use the devcontaiener

* Now you can open a terminal in VSCode and run `python manage.py runserver` once the django project is installed. It wil also warn you that your app is running on port 8000, and promt you to open in browser.
* Enjoy developing!

### 4. I want some other extension for...
* Create a task, asking for it. This ensures all the team works with the same set of extensions and we maintain the same codebase.
