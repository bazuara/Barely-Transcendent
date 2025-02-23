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

## Project Management Guidelines

This repository is associated with the [Barely Transcendent Project](https://github.com/users/bazuara/projects/2).

### Workflow

1. **Task Creation and Assignment**  
   When a task is created or assigned, ensure it includes the following attributes:
   - **Priority:**  
     - *P0* is the highest priority, and *P3* is the lowest. This indicates the urgency of the task.
   - **Size:**  
     - Ranges from *XS* to *XL*, reflecting the difficulty and complexity of the task.
   - **Estimated Hours:**  
     - An approximation of the number of hours required to complete the task.
   - **Start and End Date:**  
     - The start date marks the beginning, and the end date should coincide with the task’s closure.

2. **Branch Creation**  
   - Create a new branch for the task by clicking on the `development` branch and selecting "Create Branch".  
   - This ensures the branch is properly linked and appropriately named.

3. **Task Execution**  
   - Work on the assigned task diligently and adhere to best practices.

4. **Merge Request**  
   - Once the task is complete, create a merge request.
   - Await feedback or merge confirmation before finalizing the task.

5. **Final Note**  
   - Enjoy the process and have fun while contributing to the project!

This structured approach ensures clarity, efficiency, and professionalism in our project management practices.
