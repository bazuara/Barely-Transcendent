# Barely Transcendent

## Devcontainer

This repository contains at its root the development container configuration for Barely Transcendent's Django project. The devcontainer setup (located in the `.devcontainer` folder at the repository root) makes it easy to get up and running with all the necessary tools and configurations.

### 1. Clone the Repository

Clone the repo to your local machine using:

```bash
git clone git@github.com:bazuara/Barely-Transcendent.git
cd Barely-Transcendent
```
### 2. Open the folder on Visual Studio Code
* Open the folder with VSCode using:

```bash
code .
```
* Visual Studio Code should prompt you to `Reopen in Container` with a menu at the bottom right. If it doesn't, use your command palette to run `Dev Containers: Rebuild and Reopen in Container`.
* Wait until your VSCode changes the theme and installs all plugins. Don't worry, all this config only applies to the container.

### 3. Use the Devcontainer

* Now you can open a terminal in VSCode and run `python manage.py runserver` once the Django project is installed. It will also warn you that your app is running on port 8000 and prompt you to open it in the browser.
* Enjoy developing!

### 4. I want some other extension for...
* Create a task asking for it. This ensures all the team works with the same set of extensions and we maintain the same codebase.

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

## Adding a New Page to the SPA Structure

To add a new page to the Barely Transcendent Django SPA, follow these steps:

### **1. Create a View for the New Page**
Define the view in `views.py`. Ensure it returns a different response depending on whether the request is from `htmx` or a full page load.

📌 **Example (`views.py`)**:
```python
from django.shortcuts import render

def new_page(request):
    template = "partials/new_page.html" if request.htmx else "new_page.html"
    return render(request, template)
```

---

### **2. Create the Templates**
You need two template files:
1. `new_page.html` (extends `base.html`).
2. `partials/new_page.html` (only the content, for `htmx` updates).

📌 **Example (`templates/new_page.html`)**:
```html
{% extends "base.html" %}

{% block content %}
    {% include "partials/new_page.html" %}
{% endblock %}
```

📌 **Example (`templates/partials/new_page.html`)**:
```html
<div class="container text-center">
    <h2 class="mt-4">New Page</h2>
    <p>This is a dynamically loaded page using Django and htmx.</p>
</div>
```

---

### **3. Add the URL for the New Page**
Define the URL pattern in `urls.py`:

📌 **Example (`urls.py`)**:
```python
from django.urls import path
from .views import new_page

urlpatterns = [
    path('new-page/', new_page, name='new_page'),
]
```

---

### **4. Add the Link to the Navbar**
Modify `partials/header.html` to include the new page:

📌 **Example (`templates/partials/header.html`)**:
```html
<li class="nav-item">
    <a class="nav-link" href="{% url 'new_page' %}"
       hx-get="{% url 'new_page' %}"
       hx-target="#content"
       hx-push-url="true">
        New Page
    </a>
</li>
```

---

### **5. Test the New Page**
1. Run the Django server:
   ```bash
   python manage.py runserver
   ```
2. Open the app in your browser (`http://127.0.0.1:8000`).
3. Click the **"New Page"** link.
4. Confirm that:
   - The URL updates in the browser.
   - Only the `<main>` content is replaced (header and footer remain static).
   - No full page reload occurs (check **Network > XHR** in DevTools).

---

## **✅ Summary**
To add a new page in the SPA:
1. **Create a view** in `views.py`.
2. **Add templates** (`new_page.html` and `partials/new_page.html`).
3. **Define the route** in `urls.py`.
4. **Update the navbar** in `partials/header.html`.
5. **Test the page** to confirm that it updates dynamically.

This approach ensures the app remains a **true SPA**, keeping the user experience smooth and efficient. 🚀

