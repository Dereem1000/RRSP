#!/usr/bin/env python3
"""
Computer Dynamics License Studio — modern GUI for license activation management.

Run: python license_activation_gui_modern.py
Classic GUI remains at license_activation_gui.py
"""

from __future__ import annotations

import threading
import tkinter as tk
from tkinter import messagebox, simpledialog, ttk

from license_gui_service import (
    BUSINESS_PRODUCT_OPTIONS,
    DURATION_BY_LICENSE_TYPE,
    LICENSE_TYPE_OPTIONS,
    LicenseGuiService,
)
from license_types import normalize_license_type, parse_duration_days, validate_license_type


class Theme:
    BG = '#f1f5f9'
    SURFACE = '#ffffff'
    SIDEBAR = '#0f172a'
    SIDEBAR_HOVER = '#1e293b'
    SIDEBAR_ACTIVE = '#334155'
    TEXT = '#0f172a'
    MUTED = '#64748b'
    ACCENT = '#4f46e5'
    ACCENT_HOVER = '#4338ca'
    SUCCESS = '#059669'
    WARNING = '#d97706'
    DANGER = '#dc2626'
    BORDER = '#e2e8f0'
    FONT = ('Segoe UI', 10)
    FONT_TITLE = ('Segoe UI', 18, 'bold')
    FONT_SECTION = ('Segoe UI', 11, 'bold')
    FONT_STAT = ('Segoe UI', 22, 'bold')


class ModernLicenseGUI:
    def __init__(self, root: tk.Tk) -> None:
        self.root = root
        self.service = LicenseGuiService()
        self.service.ensure_database()
        config = self.service.load_msp_config()

        self.root.title('Computer Dynamics — License Studio')
        self.root.geometry('1280x780')
        self.root.minsize(1024, 640)
        self.root.configure(bg=Theme.BG)

        self.current_page = tk.StringVar(value='dashboard')
        self.status_filter = tk.StringVar(value='all')
        self.search_var = tk.StringVar()
        self.selected_license_id: int | None = None

        self.msp_api_url_var = tk.StringVar(value=config.get('msp_api_url', ''))
        self.msp_api_token_var = tk.StringVar(value=config.get('msp_api_token', ''))

        self.license_type_var = tk.StringVar(value='Extended 30 Days')
        self.product_var = tk.StringVar(value=BUSINESS_PRODUCT_OPTIONS[0])
        self.duration_var = tk.StringVar(value='30')
        self.max_users_var = tk.StringVar(value='5')

        self._apply_styles()
        self._build_shell()
        self.show_page('dashboard')

    def _apply_styles(self) -> None:
        style = ttk.Style()
        try:
            style.theme_use('clam')
        except tk.TclError:
            pass
        style.configure('.', background=Theme.BG, font=Theme.FONT)
        style.configure('TFrame', background=Theme.BG)
        style.configure('Card.TFrame', background=Theme.SURFACE)
        style.configure('TLabel', background=Theme.BG, foreground=Theme.TEXT, font=Theme.FONT)
        style.configure('Card.TLabel', background=Theme.SURFACE, foreground=Theme.TEXT)
        style.configure('Muted.TLabel', background=Theme.BG, foreground=Theme.MUTED, font=('Segoe UI', 9))
        style.configure('CardMuted.TLabel', background=Theme.SURFACE, foreground=Theme.MUTED, font=('Segoe UI', 9))
        style.configure('Title.TLabel', background=Theme.BG, foreground=Theme.TEXT, font=Theme.FONT_TITLE)
        style.configure('Section.TLabel', background=Theme.SURFACE, foreground=Theme.TEXT, font=Theme.FONT_SECTION)
        style.configure('StatValue.TLabel', background=Theme.SURFACE, foreground=Theme.ACCENT, font=Theme.FONT_STAT)
        style.configure('TButton', padding=(12, 8), font=Theme.FONT)
        style.configure('Accent.TButton', padding=(12, 8))
        style.map('Accent.TButton', background=[('active', Theme.ACCENT_HOVER)])
        style.configure('Treeview', rowheight=28, font=Theme.FONT, background=Theme.SURFACE, fieldbackground=Theme.SURFACE)
        style.configure('Treeview.Heading', font=('Segoe UI', 9, 'bold'), background='#f8fafc', foreground=Theme.MUTED)
        style.configure('TCombobox', padding=4)
        style.configure('TEntry', padding=4)

    def _build_shell(self) -> None:
        self.root.columnconfigure(1, weight=1)
        self.root.rowconfigure(0, weight=1)

        sidebar = tk.Frame(self.root, bg=Theme.SIDEBAR, width=220)
        sidebar.grid(row=0, column=0, sticky='nsew')
        sidebar.grid_propagate(False)

        tk.Label(
            sidebar,
            text='License Studio',
            bg=Theme.SIDEBAR,
            fg='#f8fafc',
            font=('Segoe UI', 14, 'bold'),
            anchor='w',
        ).pack(fill='x', padx=20, pady=(24, 4))
        tk.Label(
            sidebar,
            text='Activation management',
            bg=Theme.SIDEBAR,
            fg='#94a3b8',
            font=('Segoe UI', 9),
            anchor='w',
        ).pack(fill='x', padx=20, pady=(0, 24))

        self.nav_buttons: dict[str, tk.Button] = {}
        for key, label in (
            ('dashboard', 'Dashboard'),
            ('licenses', 'Licenses'),
            ('portal', 'Portal sync'),
            ('settings', 'Settings'),
        ):
            btn = tk.Button(
                sidebar,
                text=f'  {label}',
                anchor='w',
                relief='flat',
                borderwidth=0,
                padx=20,
                pady=12,
                font=Theme.FONT,
                bg=Theme.SIDEBAR,
                fg='#e2e8f0',
                activebackground=Theme.SIDEBAR_HOVER,
                activeforeground='#ffffff',
                command=lambda k=key: self.show_page(k),
            )
            btn.pack(fill='x')
            self.nav_buttons[key] = btn

        tk.Label(
            sidebar,
            text='Classic GUI still available\nvia license_activation_gui.py',
            bg=Theme.SIDEBAR,
            fg='#64748b',
            font=('Segoe UI', 8),
            justify='left',
        ).pack(side='bottom', fill='x', padx=20, pady=16)

        main = ttk.Frame(self.root, padding=20)
        main.grid(row=0, column=1, sticky='nsew')
        main.columnconfigure(0, weight=1)
        main.rowconfigure(1, weight=1)

        header = ttk.Frame(main)
        header.grid(row=0, column=0, sticky='ew', pady=(0, 16))
        header.columnconfigure(0, weight=1)
        self.page_title = ttk.Label(header, text='Dashboard', style='Title.TLabel')
        self.page_title.grid(row=0, column=0, sticky='w')
        ttk.Button(header, text='Refresh', command=self.refresh_current_page).grid(row=0, column=1, sticky='e')

        self.content = ttk.Frame(main)
        self.content.grid(row=1, column=0, sticky='nsew')
        self.content.columnconfigure(0, weight=1)
        self.content.rowconfigure(0, weight=1)

        self.pages: dict[str, ttk.Frame] = {}
        for key in ('dashboard', 'licenses', 'portal', 'settings'):
            frame = ttk.Frame(self.content)
            self.pages[key] = frame

        self._build_dashboard_page()
        self._build_licenses_page()
        self._build_portal_page()
        self._build_settings_page()

        self.status_var = tk.StringVar(value='Ready')
        status = ttk.Label(main, textvariable=self.status_var, style='Muted.TLabel')
        status.grid(row=2, column=0, sticky='w', pady=(12, 0))

    def set_status(self, text: str) -> None:
        self.status_var.set(text)

    def show_page(self, key: str) -> None:
        self.current_page.set(key)
        titles = {
            'dashboard': 'Dashboard',
            'licenses': 'Licenses',
            'portal': 'Portal sync',
            'settings': 'Settings',
        }
        self.page_title.configure(text=titles.get(key, key))
        for name, frame in self.pages.items():
            frame.grid_remove()
        self.pages[key].grid(row=0, column=0, sticky='nsew')
        for name, btn in self.nav_buttons.items():
            btn.configure(
                bg=Theme.SIDEBAR_ACTIVE if name == key else Theme.SIDEBAR,
                fg='#ffffff' if name == key else '#e2e8f0',
            )
        self.refresh_current_page()

    def refresh_current_page(self) -> None:
        page = self.current_page.get()
        if page == 'dashboard':
            self.refresh_dashboard()
        elif page == 'licenses':
            self.refresh_licenses()
        elif page == 'portal':
            self.refresh_portal_clients()
        elif page == 'settings':
            config = self.service.load_msp_config()
            self.msp_api_url_var.set(config.get('msp_api_url', ''))
            self.msp_api_token_var.set(config.get('msp_api_token', ''))

    def _card(self, parent: ttk.Frame, **grid) -> ttk.Frame:
        outer = ttk.Frame(parent, style='Card.TFrame', padding=16)
        grid.setdefault('sticky', 'nsew')
        outer.grid(**grid, padx=4, pady=4)
        inner = ttk.Frame(outer, style='Card.TFrame')
        inner.pack(fill='both', expand=True)
        return inner

    def _build_dashboard_page(self) -> None:
        page = self.pages['dashboard']
        page.columnconfigure((0, 1, 2, 3), weight=1)
        page.rowconfigure(1, weight=1)

        self.stat_labels: dict[str, ttk.Label] = {}
        stats = (
            ('companies', 'Companies'),
            ('licenses', 'Licenses'),
            ('active', 'Active'),
            ('expired', 'Expired'),
        )
        for idx, (key, label) in enumerate(stats):
            card = self._card(page, row=0, column=idx)
            ttk.Label(card, text=label, style='CardMuted.TLabel').pack(anchor='w')
            val = ttk.Label(card, text='—', style='StatValue.TLabel')
            val.pack(anchor='w', pady=(4, 0))
            self.stat_labels[key] = val

        recent_card = self._card(page, row=1, column=0, columnspan=4)
        page.rowconfigure(1, weight=1)
        ttk.Label(recent_card, text='Recent licenses', style='Section.TLabel').pack(anchor='w', pady=(0, 8))
        cols = ('company', 'product', 'status', 'serial')
        self.recent_tree = ttk.Treeview(recent_card, columns=cols, show='headings', height=10)
        for col, heading, width in (
            ('company', 'Company', 220),
            ('product', 'Product', 200),
            ('status', 'Status', 100),
            ('serial', 'Serial', 360),
        ):
            self.recent_tree.heading(col, text=heading)
            self.recent_tree.column(col, width=width, anchor='w')
        self.recent_tree.pack(fill='both', expand=True)
        self.recent_tree.tag_configure('Active', foreground=Theme.SUCCESS)
        self.recent_tree.tag_configure('Expired', foreground=Theme.WARNING)
        self.recent_tree.tag_configure('Inactive', foreground=Theme.MUTED)

    def refresh_dashboard(self) -> None:
        try:
            data = self.service.get_dashboard()
            self.stat_labels['companies'].configure(text=str(data['companies']))
            self.stat_labels['licenses'].configure(text=str(data['licenses']))
            self.stat_labels['active'].configure(text=str(data['active']))
            self.stat_labels['expired'].configure(text=str(data['expired']))
            for item in self.recent_tree.get_children():
                self.recent_tree.delete(item)
            for row in data['recent']:
                self.recent_tree.insert(
                    '',
                    'end',
                    values=(row['company'], row['product'], row['status'], row['serial']),
                    tags=(row['status'],),
                )
            self.set_status('Dashboard updated')
        except Exception as exc:
            messagebox.showerror('Error', str(exc))

    def _build_licenses_page(self) -> None:
        page = self.pages['licenses']
        page.columnconfigure(0, weight=3)
        page.columnconfigure(1, weight=2)
        page.rowconfigure(1, weight=1)

        toolbar = ttk.Frame(page)
        toolbar.grid(row=0, column=0, columnspan=2, sticky='ew', pady=(0, 12))
        ttk.Label(toolbar, text='Filter').pack(side='left')
        filter_box = ttk.Combobox(
            toolbar,
            textvariable=self.status_filter,
            values=['all', 'Active', 'Inactive', 'Expired'],
            state='readonly',
            width=12,
        )
        filter_box.pack(side='left', padx=(6, 16))
        filter_box.bind('<<ComboboxSelected>>', lambda _e: self.refresh_licenses())
        ttk.Label(toolbar, text='Search').pack(side='left')
        search_entry = ttk.Entry(toolbar, textvariable=self.search_var, width=28)
        search_entry.pack(side='left', padx=6)
        search_entry.bind('<KeyRelease>', lambda _e: self.refresh_licenses())
        ttk.Button(toolbar, text='New license…', command=self.add_license_dialog).pack(side='right', padx=4)
        self.license_count_label = ttk.Label(toolbar, text='', style='Muted.TLabel')
        self.license_count_label.pack(side='right', padx=(0, 12))

        list_card = self._card(page, row=1, column=0, sticky='nsew')
        ttk.Label(
            list_card,
            text='All licenses — one row per system (companies with multiple systems appear multiple times)',
            style='CardMuted.TLabel',
        ).pack(anchor='w', pady=(0, 8))
        tree_frame = ttk.Frame(list_card, style='Card.TFrame')
        tree_frame.pack(fill='both', expand=True)
        cols = ('company', 'product', 'status', 'expires', 'serial')
        self.license_tree = ttk.Treeview(tree_frame, columns=cols, show='headings', selectmode='browse')
        for col, heading, width in (
            ('company', 'Company', 180),
            ('product', 'Product', 160),
            ('status', 'Status', 90),
            ('expires', 'Expires', 100),
            ('serial', 'Serial', 280),
        ):
            self.license_tree.heading(col, text=heading)
            self.license_tree.column(col, width=width, anchor='w')
        license_scroll = ttk.Scrollbar(tree_frame, orient='vertical', command=self.license_tree.yview)
        self.license_tree.configure(yscrollcommand=license_scroll.set)
        self.license_tree.pack(side='left', fill='both', expand=True)
        license_scroll.pack(side='right', fill='y')
        self.license_tree.bind('<<TreeviewSelect>>', self.on_license_select)
        self.license_tree.tag_configure('Active', foreground=Theme.SUCCESS)
        self.license_tree.tag_configure('Expired', foreground=Theme.WARNING)
        self.license_tree.tag_configure('Inactive', foreground=Theme.MUTED)

        detail_card = self._card(page, row=1, column=1, sticky='nsew')
        ttk.Label(detail_card, text='License details', style='Section.TLabel').pack(anchor='w')
        self.detail_text = tk.Text(
            detail_card,
            height=10,
            wrap='word',
            font=('Consolas', 9),
            bg='#f8fafc',
            fg=Theme.TEXT,
            relief='flat',
            padx=8,
            pady=8,
        )
        self.detail_text.pack(fill='x', pady=(8, 12))
        self.detail_text.configure(state='disabled')

        form = ttk.Frame(detail_card, style='Card.TFrame')
        form.pack(fill='x', pady=(0, 8))
        row1 = ttk.Frame(form, style='Card.TFrame')
        row1.pack(fill='x', pady=2)
        ttk.Label(row1, text='Type', style='Card.TLabel', width=8).pack(side='left')
        type_combo = ttk.Combobox(row1, textvariable=self.license_type_var, values=LICENSE_TYPE_OPTIONS, state='readonly', width=18)
        type_combo.pack(side='left', fill='x', expand=True)
        type_combo.bind('<<ComboboxSelected>>', self.on_license_type_change)
        row2 = ttk.Frame(form, style='Card.TFrame')
        row2.pack(fill='x', pady=2)
        ttk.Label(row2, text='Product', style='Card.TLabel', width=8).pack(side='left')
        ttk.Combobox(row2, textvariable=self.product_var, values=BUSINESS_PRODUCT_OPTIONS, state='readonly', width=18).pack(side='left', fill='x', expand=True)
        row3 = ttk.Frame(form, style='Card.TFrame')
        row3.pack(fill='x', pady=2)
        ttk.Label(row3, text='Days', style='Card.TLabel', width=8).pack(side='left')
        ttk.Entry(row3, textvariable=self.duration_var, width=8).pack(side='left')
        ttk.Label(row3, text='Users', style='Card.TLabel').pack(side='left', padx=(12, 4))
        ttk.Entry(row3, textvariable=self.max_users_var, width=8).pack(side='left')

        actions = ttk.Frame(detail_card, style='Card.TFrame')
        actions.pack(fill='x')
        self.activate_btn = ttk.Button(actions, text='Activate', style='Accent.TButton', command=self.activate_selected)
        self.activate_btn.pack(fill='x', pady=2)
        btn_row = ttk.Frame(actions, style='Card.TFrame')
        btn_row.pack(fill='x', pady=2)
        for text, cmd in (
            ('Extend', self.extend_selected),
            ('Deactivate', self.deactivate_selected),
            ('Reactivate', self.reactivate_selected),
        ):
            ttk.Button(btn_row, text=text, command=cmd).pack(side='left', expand=True, fill='x', padx=2)
        btn_row2 = ttk.Frame(actions, style='Card.TFrame')
        btn_row2.pack(fill='x', pady=2)
        for text, cmd in (
            ('Mark expired', self.mark_expired_selected),
            ('Device +', self.add_device_license),
            ('Clear bind', self.clear_binding),
        ):
            ttk.Button(btn_row2, text=text, command=cmd).pack(side='left', expand=True, fill='x', padx=2)
        ttk.Button(actions, text='Delete license', command=self.delete_selected).pack(fill='x', pady=(6, 0))

    def on_license_type_change(self, _event=None) -> None:
        days = DURATION_BY_LICENSE_TYPE.get(self.license_type_var.get(), 30)
        self.duration_var.set(str(days))

    def refresh_licenses(self) -> None:
        try:
            status_filter = self.status_filter.get()
            search = self.search_var.get().strip()
            rows = self.service.list_licenses(status_filter, search)
            total = self.service.count_licenses()
            for item in self.license_tree.get_children():
                self.license_tree.delete(item)
            for row in rows:
                self.license_tree.insert(
                    '',
                    'end',
                    iid=str(row['id']),
                    values=(row['company'], row['product'], row['status'], row['expires'], row['serial']),
                    tags=(row['status'],),
                )
            if status_filter != 'all' or search:
                summary = f'Showing {len(rows)} of {total}'
            else:
                summary = f'{total} license(s)'
            self.license_count_label.configure(text=summary)
            self.set_status(f'{len(rows)} license(s) listed')
        except Exception as exc:
            messagebox.showerror('Error', str(exc))

    def on_license_select(self, _event=None) -> None:
        selection = self.license_tree.selection()
        if not selection:
            return
        license_id = int(selection[0])
        self.selected_license_id = license_id
        try:
            detail = self.service.get_license_detail(license_id)
            if not detail:
                return
            lines = [
                f"Serial: {detail['serial']}",
                f"Company: {detail['company']}",
                f"Status: {detail['status']}",
                f"Product: {detail['product']}",
                f"Type: {detail['license_type']}  |  Users: {detail['max_users']}",
                f"Binding: {detail['binding']}",
                f"Activated: {detail['activation_date'] or '—'}",
                f"Expires: {detail['expires'] or 'No expiry'}",
            ]
            self.detail_text.configure(state='normal')
            self.detail_text.delete('1.0', 'end')
            self.detail_text.insert('1.0', '\n'.join(lines))
            self.detail_text.configure(state='disabled')
            self.license_type_var.set(normalize_license_type(detail['license_type']))
            self.max_users_var.set(str(detail['max_users']))
            products = [p.strip() for p in detail['product'].split(',') if p.strip() and p.strip() != '—']
            if products and products[0] in BUSINESS_PRODUCT_OPTIONS:
                self.product_var.set(products[0])
            state = 'disabled' if detail['is_active'] else 'normal'
            self.activate_btn.configure(state=state)
        except Exception as exc:
            messagebox.showerror('Error', str(exc))

    def _require_selection(self) -> int | None:
        if self.selected_license_id is None:
            messagebox.showwarning('Select a license', 'Choose a license from the list first.')
            return None
        return self.selected_license_id

    def activate_selected(self) -> None:
        license_id = self._require_selection()
        if license_id is None:
            return
        try:
            license_type = validate_license_type(self.license_type_var.get())
            duration = parse_duration_days(self.duration_var.get(), license_type)
            self.service.activate_license(
                license_id,
                license_type=license_type,
                product_label=self.product_var.get(),
                duration_days=duration,
                max_users=int(self.max_users_var.get()) if self.max_users_var.get().isdigit() else 1,
            )
            messagebox.showinfo('Activated', 'License is now active.')
            self.refresh_licenses()
            self.on_license_select()
        except Exception as exc:
            messagebox.showerror('Error', str(exc))

    def deactivate_selected(self) -> None:
        license_id = self._require_selection()
        if license_id is None or not messagebox.askyesno('Deactivate', 'Deactivate this license?'):
            return
        try:
            self.service.deactivate_license(license_id)
            self.refresh_licenses()
            self.on_license_select()
        except Exception as exc:
            messagebox.showerror('Error', str(exc))

    def mark_expired_selected(self) -> None:
        license_id = self._require_selection()
        if license_id is None or not messagebox.askyesno('Mark expired', 'Mark this license as expired?'):
            return
        try:
            self.service.mark_expired(license_id)
            self.refresh_licenses()
            self.on_license_select()
        except Exception as exc:
            messagebox.showerror('Error', str(exc))

    def reactivate_selected(self) -> None:
        license_id = self._require_selection()
        if license_id is None:
            return
        extend = messagebox.askyesno('Reactivate', 'Extend expiration before reactivating?')
        days = None
        if extend:
            days = simpledialog.askinteger('Extend', 'Days to extend:', minvalue=1, maxvalue=3650)
            if not days:
                return
        try:
            self.service.reactivate_license(license_id, extend_days=days)
            self.refresh_licenses()
            self.on_license_select()
        except Exception as exc:
            messagebox.showerror('Error', str(exc))

    def extend_selected(self) -> None:
        license_id = self._require_selection()
        if license_id is None:
            return
        days = simpledialog.askinteger('Extend license', 'Additional days:', minvalue=1, maxvalue=3650)
        if not days:
            return
        try:
            new_exp = self.service.extend_license(license_id, days)
            messagebox.showinfo('Extended', f'New expiration: {new_exp}')
            self.refresh_licenses()
            self.on_license_select()
        except Exception as exc:
            messagebox.showerror('Error', str(exc))

    def delete_selected(self) -> None:
        license_id = self._require_selection()
        if license_id is None or not messagebox.askyesno('Delete', 'Delete this license permanently?'):
            return
        try:
            serial = self.service.delete_license(license_id)
            messagebox.showinfo('Deleted', f'Removed {serial}')
            self.selected_license_id = None
            self.refresh_licenses()
        except Exception as exc:
            messagebox.showerror('Error', str(exc))

    def add_device_license(self) -> None:
        license_id = self._require_selection()
        if license_id is None:
            return
        try:
            serial = self.service.add_device_license(license_id)
            messagebox.showinfo('Device license', f'Created:\n{serial}')
            self.refresh_licenses()
        except Exception as exc:
            messagebox.showerror('Error', str(exc))

    def clear_binding(self) -> None:
        license_id = self._require_selection()
        if license_id is None:
            return
        try:
            self.service.clear_device_binding(license_id)
            messagebox.showinfo('Binding cleared', 'License can bind to a new device on next activation.')
            self.on_license_select()
        except Exception as exc:
            messagebox.showerror('Error', str(exc))

    def add_license_dialog(self) -> None:
        companies = self.service.list_companies()
        if not companies:
            messagebox.showinfo('No companies', 'Sync clients from the Portal sync page first.')
            return
        dialog = tk.Toplevel(self.root)
        dialog.title('New license')
        dialog.geometry('480x360')
        dialog.transient(self.root)
        dialog.grab_set()
        ttk.Label(dialog, text='Select company', style='Section.TLabel').pack(anchor='w', padx=16, pady=(16, 8))
        tree = ttk.Treeview(dialog, columns=('name', 'contact'), show='headings', height=10)
        tree.heading('name', text='Company')
        tree.heading('contact', text='Contact')
        tree.column('name', width=240)
        tree.column('contact', width=180)
        tree.pack(fill='both', expand=True, padx=16, pady=8)
        for company in companies:
            tree.insert('', 'end', iid=str(company['id']), values=(company['name'], company['contact']))

        def create() -> None:
            sel = tree.selection()
            if not sel:
                messagebox.showwarning('Select company', 'Choose a company.')
                return
            try:
                serial = self.service.add_license_for_company(int(sel[0]))
                messagebox.showinfo('Created', f'Pending license:\n{serial}')
                dialog.destroy()
                self.refresh_licenses()
            except Exception as exc:
                messagebox.showerror('Error', str(exc))

        btns = ttk.Frame(dialog)
        btns.pack(fill='x', padx=16, pady=12)
        ttk.Button(btns, text='Create pending license', command=create).pack(side='left')
        ttk.Button(btns, text='Cancel', command=dialog.destroy).pack(side='right')

    def _build_portal_page(self) -> None:
        page = self.pages['portal']
        page.rowconfigure(2, weight=1)
        page.columnconfigure(0, weight=1)

        top = ttk.Frame(page)
        top.grid(row=0, column=0, sticky='ew', pady=(0, 8))
        top.columnconfigure(0, weight=1)
        ttk.Label(
            top,
            text='Pull clients with activation features from the CD portal, sync companies/licenses, and push updates.',
            style='Muted.TLabel',
            wraplength=700,
        ).grid(row=0, column=0, sticky='w')
        toolbar = ttk.Frame(top)
        toolbar.grid(row=0, column=1, sticky='e')
        ttk.Button(toolbar, text='Test connection', command=self.test_msp).pack(side='left', padx=4)
        ttk.Button(toolbar, text='Load clients', command=self.refresh_portal_clients).pack(side='left', padx=4)
        ttk.Button(toolbar, text='Sync all', command=self.sync_all_portal).pack(side='left', padx=4)

        card = self._card(page, row=2, column=0, sticky='nsew')
        cols = ('company', 'contact', 'service', 'features', 'license')
        self.portal_tree = ttk.Treeview(card, columns=cols, show='headings')
        for col, heading, width in (
            ('company', 'Company', 200),
            ('contact', 'Contact', 140),
            ('service', 'Plan', 80),
            ('features', 'Portal features', 200),
            ('license', 'License DB', 120),
        ):
            self.portal_tree.heading(col, text=heading)
            self.portal_tree.column(col, width=width, anchor='w')
        self.portal_tree.pack(fill='both', expand=True)
        self.portal_tree.bind('<Double-1>', self.edit_portal_client)

    def test_msp(self) -> None:
        self.service.msp.api_url = self.msp_api_url_var.get().strip()
        self.service.msp.api_token = self.msp_api_token_var.get().strip()
        try:
            result = self.service.test_msp_connection()
            if 'error' in result:
                raise RuntimeError(result['error'])
            messagebox.showinfo(
                'Connected',
                f"Total clients: {result.get('total_clients', 0)}\n"
                f"With activation features: {result.get('filtered_clients', 0)}",
            )
        except Exception as exc:
            messagebox.showerror('Connection failed', str(exc))

    def refresh_portal_clients(self) -> None:
        self.service.msp.api_url = self.msp_api_url_var.get().strip()
        self.service.msp.api_token = self.msp_api_token_var.get().strip()
        try:
            clients = self.service.load_msp_clients()
            for item in self.portal_tree.get_children():
                self.portal_tree.delete(item)
            for client in clients:
                self.portal_tree.insert(
                    '',
                    'end',
                    iid=str(client['id']),
                    values=(
                        client['company'],
                        client['contact'],
                        client['service'],
                        client['features'],
                        client['license_status'],
                    ),
                )
            self.set_status(f'{len(clients)} portal client(s)')
        except Exception as exc:
            messagebox.showerror('Error', str(exc))

    def sync_all_portal(self) -> None:
        self.service.msp.api_url = self.msp_api_url_var.get().strip()
        self.service.msp.api_token = self.msp_api_token_var.get().strip()
        progress = tk.Toplevel(self.root)
        progress.title('Syncing')
        progress.geometry('320x120')
        progress.transient(self.root)
        ttk.Label(progress, text='Syncing portal clients…').pack(pady=20)
        bar = ttk.Progressbar(progress, mode='indeterminate')
        bar.pack(fill='x', padx=24)
        bar.start()

        def worker() -> None:
            try:
                result = self.service.sync_all_msp_clients()
                self.root.after(0, progress.destroy)
                if result.get('success'):
                    self.root.after(
                        0,
                        lambda: messagebox.showinfo(
                            'Sync complete',
                            f"Synced {result.get('synced_count', 0)} clients\n"
                            f"Licenses created: {result.get('licenses_created', 0)}\n"
                            f"Licenses updated: {result.get('licenses_updated', 0)}",
                        ),
                    )
                    self.root.after(0, self.refresh_portal_clients)
                    self.root.after(0, self.refresh_dashboard)
                else:
                    self.root.after(0, lambda: messagebox.showerror('Sync failed', result.get('error', 'Unknown error')))
            except Exception as exc:
                self.root.after(0, progress.destroy)
                self.root.after(0, lambda: messagebox.showerror('Sync failed', str(exc)))

        threading.Thread(target=worker, daemon=True).start()

    def edit_portal_client(self, _event=None) -> None:
        selection = self.portal_tree.selection()
        if not selection:
            return
        client_id = selection[0]
        item = self.portal_tree.item(selection[0])
        company_name = item['values'][0]
        features_raw = str(item['values'][3])
        portal_features = [f.strip() for f in features_raw.split(',') if f.strip() and f.strip() != '—']

        dialog = tk.Toplevel(self.root)
        dialog.title(f'Push licenses — {company_name}')
        dialog.geometry('440x420')
        dialog.transient(self.root)
        dialog.grab_set()
        ttk.Label(dialog, text=company_name, style='Section.TLabel').pack(anchor='w', padx=16, pady=(16, 4))
        ttk.Label(dialog, text='Issue or update licenses for portal activation features', style='Muted.TLabel').pack(anchor='w', padx=16)

        type_var = tk.StringVar(value='Extended 30 Days')
        duration_var = tk.StringVar(value='30')
        users_var = tk.StringVar(value='5')
        ttk.Label(dialog, text='License type').pack(anchor='w', padx=16, pady=(12, 2))
        type_combo = ttk.Combobox(dialog, textvariable=type_var, values=LICENSE_TYPE_OPTIONS, state='readonly')
        type_combo.pack(fill='x', padx=16)

        def on_portal_type_change(_event=None) -> None:
            duration_var.set(str(DURATION_BY_LICENSE_TYPE.get(type_var.get(), 30)))

        type_combo.bind('<<ComboboxSelected>>', on_portal_type_change)
        row = ttk.Frame(dialog)
        row.pack(fill='x', padx=16, pady=8)
        ttk.Label(row, text='Days').pack(side='left')
        ttk.Entry(row, textvariable=duration_var, width=8).pack(side='left', padx=6)
        ttk.Label(row, text='Max users').pack(side='left', padx=(12, 4))
        ttk.Entry(row, textvariable=users_var, width=8).pack(side='left')

        feature_vars: dict[str, tk.BooleanVar] = {}
        box = ttk.LabelFrame(dialog, text='Products', padding=12)
        box.pack(fill='both', expand=True, padx=16, pady=8)
        label_map = {
            'pos': 'Point of Sale Systems',
            'restaurant': 'Restaurant Management',
            'document': 'Document Management',
            'ecommerce': 'E-commerce Websites',
            'auto': 'Auto System',
            'distribution': 'Distribution System',
            'crm': 'Event Sponsor CRM',
        }
        portal_labels = set()
        for token in portal_features:
            key = token.strip().lower()
            if key in label_map:
                portal_labels.add(label_map[key])
            elif token in BUSINESS_PRODUCT_OPTIONS:
                portal_labels.add(token)
        for idx, product in enumerate(BUSINESS_PRODUCT_OPTIONS):
            var = tk.BooleanVar(value=product in portal_labels)
            feature_vars[product] = var
            ttk.Checkbutton(box, text=product, variable=var).grid(row=idx // 2, column=idx % 2, sticky='w', padx=4, pady=2)

        def save() -> None:
            selected = [name for name, var in feature_vars.items() if var.get()]
            if not selected:
                messagebox.showwarning('Products', 'Select at least one product.')
                return
            try:
                license_type = validate_license_type(type_var.get())
                duration = parse_duration_days(duration_var.get(), license_type)
                users = int(users_var.get()) if users_var.get().isdigit() else 5
                self.service.msp.api_url = self.msp_api_url_var.get().strip()
                self.service.msp.api_token = self.msp_api_token_var.get().strip()
                result = self.service.push_portal_client_licenses(
                    client_id,
                    license_type=license_type,
                    duration=duration,
                    max_users=users,
                    product_labels=selected,
                )
                if result.get('success'):
                    created = result.get('created_licenses', 0)
                    updated = result.get('updated_licenses', 0)
                    detail = []
                    if created:
                        detail.append(f'{created} license(s) created')
                    if updated:
                        detail.append(f'{updated} license(s) updated')
                    summary = '\n'.join(detail) if detail else 'License changes pushed to the activation database.'
                    messagebox.showinfo('Saved', summary)
                    dialog.destroy()
                    self.refresh_portal_clients()
                    self.refresh_licenses()
                else:
                    messagebox.showerror('Error', result.get('error', 'Update failed'))
            except Exception as exc:
                messagebox.showerror('Error', str(exc))

        btns = ttk.Frame(dialog)
        btns.pack(fill='x', padx=16, pady=12)
        ttk.Button(btns, text='Push to license DB', command=save).pack(side='left')
        ttk.Button(btns, text='Cancel', command=dialog.destroy).pack(side='right')

    def _build_settings_page(self) -> None:
        page = self.pages['settings']
        card = self._card(page, row=0, column=0, sticky='nsew')
        ttk.Label(card, text='Portal API connection', style='Section.TLabel').pack(anchor='w', pady=(0, 12))
        ttk.Label(card, text='API URL', style='Card.TLabel').pack(anchor='w')
        ttk.Entry(card, textvariable=self.msp_api_url_var).pack(fill='x', pady=(2, 10))
        ttk.Label(card, text='Bearer token (from portal Settings → Integrations)', style='Card.TLabel').pack(anchor='w')
        ttk.Entry(card, textvariable=self.msp_api_token_var, show='•').pack(fill='x', pady=(2, 10))
        button_row = ttk.Frame(card)
        button_row.pack(fill='x', pady=(8, 0))
        ttk.Button(button_row, text='Save settings', command=self.save_settings).pack(side='left')
        ttk.Button(button_row, text='Sync token to Mini', command=self.sync_token_to_mini).pack(side='left', padx=(8, 0))

    def sync_token_to_mini(self) -> None:
        try:
            self.service.save_msp_config(
                self.msp_api_url_var.get().strip(),
                self.msp_api_token_var.get().strip(),
            )
            result = self.service.sync_msp_token_to_mini()
            if result.get('success'):
                messagebox.showinfo('Synced to Mini', result.get('message') or 'MSP token synced to Mini.')
            else:
                messagebox.showerror('Mini sync failed', result.get('error') or 'Unknown error')
        except Exception as exc:
            messagebox.showerror('Mini sync failed', str(exc))

    def save_settings(self) -> None:
        try:
            self.service.save_msp_config(self.msp_api_url_var.get().strip(), self.msp_api_token_var.get().strip())
            messagebox.showinfo('Saved', 'Portal connection settings saved.')
        except Exception as exc:
            messagebox.showerror('Error', str(exc))


def main() -> None:
    root = tk.Tk()
    ModernLicenseGUI(root)
    root.mainloop()


if __name__ == '__main__':
    main()
