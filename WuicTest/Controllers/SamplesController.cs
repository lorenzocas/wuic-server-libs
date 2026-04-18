using Microsoft.AspNetCore.Mvc;

namespace WuicTest.Controllers;

/// <summary>
/// Endpoint REST custom usati dagli esempi di "Pattern di sviluppo" nel
/// frontend WuicTest (cartella <c>wwwroot/src/app/component/examples/</c>).
///
/// Per semplicità i dati sono in liste statiche in-memory: si perdono al
/// restart, ma evitano migration SQL e dipendenze esterne. In produzione si
/// sostituiscono con accesso EF Core / Dapper / repository custom.
///
/// Mappato su <c>/api/samples</c> (vedi attribute Route). Endpoint coperti:
/// - GET    /api/samples/inventory          → Pattern 3b
/// - GET    /api/samples/tasks              → Pattern 4a
/// - POST   /api/samples/tasks              → Pattern 4a
/// - PUT    /api/samples/tasks/{id}         → Pattern 4a
/// - DELETE /api/samples/tasks/{id}         → Pattern 4a
/// - POST   /api/samples/registrations      → Pattern 4b
/// </summary>
[ApiController]
[Route("api/samples")]
public class SamplesController : ControllerBase
{
    // === Pattern 3b — Inventory (read-only demo, server-side paging/sort/filter) ==
    //
    // Endpoint deliberatamente RESTful "alla mano": accetta offset/limit/sort/filter
    // come query params e restituisce { rows, total } dove total e' il count
    // POST-filter / PRE-paging (necessario per il pager UI lato client). Il
    // componente Angular 3b (Pattern 3 server-side mode) si subscrivve agli
    // eventi onPaging/onSorting/onFiltering della list-grid e re-fetcha
    // questo endpoint con i nuovi parametri.
    private static readonly List<InventoryItem> _inventory = new()
    {
        new InventoryItem { Id = 1,  Name = "Widget A",        Stock = 120, Price = 9.90m,  Warehouse = "Milano" },
        new InventoryItem { Id = 2,  Name = "Widget B",        Stock = 30,  Price = 19.90m, Warehouse = "Milano" },
        new InventoryItem { Id = 3,  Name = "Cable HDMI 2m",   Stock = 250, Price = 4.50m,  Warehouse = "Roma"   },
        new InventoryItem { Id = 4,  Name = "Cable HDMI 5m",   Stock = 90,  Price = 7.20m,  Warehouse = "Roma"   },
        new InventoryItem { Id = 5,  Name = "Mouse wireless",  Stock = 60,  Price = 15.00m, Warehouse = "Torino" },
        new InventoryItem { Id = 6,  Name = "Tastiera USB",    Stock = 0,   Price = 25.00m, Warehouse = "Torino" },
        new InventoryItem { Id = 7,  Name = "Monitor 27\"",    Stock = 12,  Price = 199.0m, Warehouse = "Milano" },
        new InventoryItem { Id = 8,  Name = "Webcam HD",       Stock = 45,  Price = 35.50m, Warehouse = "Roma"   },
        new InventoryItem { Id = 9,  Name = "Hub USB-C 7-port",Stock = 80,  Price = 39.00m, Warehouse = "Milano" },
        new InventoryItem { Id = 10, Name = "Adapter HDMI-VGA",Stock = 200, Price = 6.50m,  Warehouse = "Roma"   },
        new InventoryItem { Id = 11, Name = "SSD 1TB NVMe",    Stock = 35,  Price = 89.00m, Warehouse = "Milano" },
        new InventoryItem { Id = 12, Name = "SSD 2TB NVMe",    Stock = 18,  Price = 159.0m, Warehouse = "Milano" },
        new InventoryItem { Id = 13, Name = "Cuffie BT",       Stock = 75,  Price = 49.90m, Warehouse = "Torino" },
        new InventoryItem { Id = 14, Name = "Mic USB studio",  Stock = 20,  Price = 89.00m, Warehouse = "Roma"   },
        new InventoryItem { Id = 15, Name = "Stand monitor",   Stock = 110, Price = 22.00m, Warehouse = "Torino" },
        new InventoryItem { Id = 16, Name = "Tappetino mouse", Stock = 300, Price = 5.00m,  Warehouse = "Milano" },
        new InventoryItem { Id = 17, Name = "Cavo Ethernet 3m",Stock = 180, Price = 7.90m,  Warehouse = "Roma"   },
        new InventoryItem { Id = 18, Name = "Switch 8 porte",  Stock = 25,  Price = 45.00m, Warehouse = "Milano" },
        new InventoryItem { Id = 19, Name = "Router WiFi 6",   Stock = 14,  Price = 129.0m, Warehouse = "Milano" },
        new InventoryItem { Id = 20, Name = "Powerbank 20000", Stock = 60,  Price = 35.00m, Warehouse = "Torino" },
        new InventoryItem { Id = 21, Name = "Caricatore 65W",  Stock = 95,  Price = 29.90m, Warehouse = "Roma"   },
        new InventoryItem { Id = 22, Name = "Webcam 4K",       Stock = 8,   Price = 119.0m, Warehouse = "Milano" },
        new InventoryItem { Id = 23, Name = "Tablet 10\"",     Stock = 22,  Price = 249.0m, Warehouse = "Milano" },
        new InventoryItem { Id = 24, Name = "Stylus Pen",      Stock = 50,  Price = 19.90m, Warehouse = "Torino" }
    };

    /// <summary>
    /// GET /api/samples/inventory?offset=0&limit=10&sortField=name&sortDir=asc
    ///                            &filterField=name&filterValue=hdmi&filterOp=contains
    ///
    /// Tutti i parametri sono opzionali. Senza filtri/sort restituisce la
    /// prima pagina di <paramref name="limit"/> elementi nell'ordine naturale.
    /// </summary>
    [HttpGet("inventory")]
    public IActionResult GetInventory(
        int offset = 0,
        int limit = 10,
        string? sortField = null,
        string? sortDir = "asc",
        string? filterField = null,
        string? filterValue = null,
        string? filterOp = "contains")
    {
        IEnumerable<InventoryItem> q = _inventory;

        // 1) Filter (applicato prima di sort/page perche' total deve essere
        //    il count POST-filter, altrimenti il pager mostra pagine vuote).
        if (!string.IsNullOrWhiteSpace(filterField) && !string.IsNullOrWhiteSpace(filterValue))
        {
            q = ApplyInventoryFilter(q, filterField, filterValue, filterOp ?? "contains");
        }

        var total = q.Count();

        // 2) Sort
        if (!string.IsNullOrWhiteSpace(sortField))
        {
            q = ApplyInventorySort(q, sortField, (sortDir ?? "asc").ToLowerInvariant());
        }

        // 3) Page
        var rows = q.Skip(Math.Max(0, offset)).Take(Math.Max(1, limit)).ToList();

        return Ok(new { rows, total });
    }

    private static IEnumerable<InventoryItem> ApplyInventoryFilter(
        IEnumerable<InventoryItem> q, string field, string value, string op)
    {
        // Lookup whitelist sui field permessi → previene filtraggi su proprieta'
        // arbitrarie (sicurezza) e centralizza il match per tipo (text vs numero).
        var f = field.ToLowerInvariant();
        var v = value.Trim();
        var o = op.ToLowerInvariant();

        bool MatchString(string source) => o switch
        {
            "eq"          => source.Equals(v, StringComparison.OrdinalIgnoreCase),
            "ne"          => !source.Equals(v, StringComparison.OrdinalIgnoreCase),
            "contains"    => source.Contains(v, StringComparison.OrdinalIgnoreCase),
            "notcontains" => !source.Contains(v, StringComparison.OrdinalIgnoreCase),
            "startswith"  => source.StartsWith(v, StringComparison.OrdinalIgnoreCase),
            "endswith"    => source.EndsWith(v, StringComparison.OrdinalIgnoreCase),
            _             => source.Contains(v, StringComparison.OrdinalIgnoreCase)
        };

        bool MatchNumber(decimal source)
        {
            if (!decimal.TryParse(v, System.Globalization.NumberStyles.Any,
                System.Globalization.CultureInfo.InvariantCulture, out var n))
            {
                return true; // input non numerico → no-op invece di nascondere tutto
            }
            return o switch
            {
                "eq" => source == n,
                "ne" => source != n,
                "lt" => source < n,
                "le" => source <= n,
                "gt" => source > n,
                "ge" => source >= n,
                _    => source == n
            };
        }

        return f switch
        {
            "name"      => q.Where(i => MatchString(i.Name)),
            "warehouse" => q.Where(i => MatchString(i.Warehouse)),
            "id"        => q.Where(i => MatchNumber(i.Id)),
            "stock"     => q.Where(i => MatchNumber(i.Stock)),
            "price"     => q.Where(i => MatchNumber(i.Price)),
            _           => q
        };
    }

    private static IEnumerable<InventoryItem> ApplyInventorySort(
        IEnumerable<InventoryItem> q, string field, string dir)
    {
        bool desc = dir == "desc";
        return field.ToLowerInvariant() switch
        {
            "id"        => desc ? q.OrderByDescending(i => i.Id)        : q.OrderBy(i => i.Id),
            "name"      => desc ? q.OrderByDescending(i => i.Name)      : q.OrderBy(i => i.Name),
            "warehouse" => desc ? q.OrderByDescending(i => i.Warehouse) : q.OrderBy(i => i.Warehouse),
            "stock"     => desc ? q.OrderByDescending(i => i.Stock)     : q.OrderBy(i => i.Stock),
            "price"     => desc ? q.OrderByDescending(i => i.Price)     : q.OrderBy(i => i.Price),
            _           => q
        };
    }

    // === Pattern 4a — Tasks (full CRUD in-memory) ============================
    private static readonly List<TaskItem> _tasks = new()
    {
        new TaskItem { Id = 1, Title = "Esplora pattern WUIC",     Done = true  },
        new TaskItem { Id = 2, Title = "Provare l'esempio 4a",      Done = false },
        new TaskItem { Id = 3, Title = "Compilare il wizard 4b",    Done = false }
    };
    private static int _nextTaskId = 4;
    private static readonly object _tasksLock = new();

    [HttpGet("tasks")]
    public IActionResult GetTasks()
    {
        lock (_tasksLock) { return Ok(_tasks.ToList()); }
    }

    [HttpPost("tasks")]
    public IActionResult AddTask([FromBody] TaskItem item)
    {
        if (item == null || string.IsNullOrWhiteSpace(item.Title))
        {
            return BadRequest(new { error = "title required" });
        }
        lock (_tasksLock)
        {
            item.Id = _nextTaskId++;
            _tasks.Add(item);
        }
        return Created($"/api/samples/tasks/{item.Id}", item);
    }

    [HttpPut("tasks/{id:int}")]
    public IActionResult UpdateTask(int id, [FromBody] TaskItem item)
    {
        lock (_tasksLock)
        {
            var existing = _tasks.FirstOrDefault(t => t.Id == id);
            if (existing == null) return NotFound();
            existing.Title = item.Title ?? existing.Title;
            existing.Done = item.Done;
        }
        return NoContent();
    }

    [HttpDelete("tasks/{id:int}")]
    public IActionResult DeleteTask(int id)
    {
        lock (_tasksLock)
        {
            var removed = _tasks.RemoveAll(t => t.Id == id);
            return removed > 0 ? NoContent() : NotFound();
        }
    }

    // === Pattern 4b — Registrations (write-only demo) ========================
    private static int _nextRegistrationId = 1;
    private static readonly object _regLock = new();

    [HttpPost("registrations")]
    public IActionResult PostRegistration([FromBody] RegistrationDto reg)
    {
        if (reg == null || string.IsNullOrWhiteSpace(reg.Email))
        {
            return BadRequest(new { error = "email required" });
        }
        int id;
        lock (_regLock) { id = _nextRegistrationId++; }
        // Volutamente NON persistiamo: lo scopo demo e' restituire un id valido
        // per chiudere il flusso del wizard e mostrare la conferma in UI.
        return Ok(new { id });
    }
}

// === DTO inline ============================================================

public class InventoryItem
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public int Stock { get; set; }
    public decimal Price { get; set; }
    public string Warehouse { get; set; } = string.Empty;
}

public class TaskItem
{
    public int Id { get; set; }
    public string Title { get; set; } = string.Empty;
    public bool Done { get; set; }
}

public class RegistrationDto
{
    public string FullName { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string Company { get; set; } = string.Empty;
    public string Role { get; set; } = string.Empty;
    public bool Newsletter { get; set; }
}
