# 📄 Documentation Template

Use this template when creating new feature documentation.

---

## 🎯 Feature Name

> One-line description of what this feature does

---

## 📋 Overview

Brief explanation (2-3 sentences) explaining the purpose and value of this feature.

```
Visual flow diagram showing the process
Step 1 ──► Step 2 ──► Step 3 ──► Complete
```

---

## 🚀 Step-by-Step Process

### Step 1: Action Name

**What the User Does:**
- Bullet point 1
- Bullet point 2
- Bullet point 3

**What Happens Behind the Scenes:**
```
System checks this
    ↓
Then does that
    ↓
Result: Success or Error
```

**Screenshots/UI Elements:**
| Element | Description |
|---------|-------------|
| Input Field | What user enters |
| Button | What happens when clicked |

---

### Step 2: Next Action

(Repeat the same format as Step 1)

---

## 🔌 API Endpoints

### 1. Endpoint Name

```http
METHOD /api/v1/endpoint-path
Content-Type: application/json
Headers: Authorization: Bearer <token>

{
  "field1": "value1",
  "field2": "value2"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Success message",
  "data": {
    "id": 1,
    "name": "Example"
  }
}
```

**Error Responses:**
```json
{
  "success": false,
  "message": "Error description",
  "statusCode": 400
}
```

---

## ⚠️ Error Handling

| Error | When It Happens | Message | How to Fix |
|-------|-----------------|---------|------------|
| Error Name | Situation | Error message | Solution steps |

---

## 📊 Database Tables Affected

1. **`table_name`** - What data is stored
2. **`another_table`** - Relationship/purpose

---

## 🔄 Related Features

- [Link to related doc](./related-feature.md) - How it connects
- [Another link](./another-feature.md) - Dependency or flow

---

## 💡 Key Points for Non-Developers

- ✅ **Point 1** - Simple explanation
- ✅ **Point 2** - Another important note
- ⚠️ **Warning** - Something to be careful about

---

## 📞 Support

Common issues and solutions:

**Q: Question 1?**  
A: Answer 1

**Q: Question 2?**  
A: Answer 2

---

*Template Version: 1.0*
