package app.cosign.mobile.signin

/**
 * Finds the username and password boxes on a sign-in screen from what Android's autofill framework
 * describes (hints, input type, HTML attributes, view ids). Pure logic: no Android types, so it is
 * unit-tested on the JVM. [T] is the platform's AutofillId.
 */
object AutofillFields {
    data class Node<T>(
        val id: T,
        val hints: List<String> = emptyList(),
        val inputType: Int = 0,
        val htmlType: String? = null,
        val htmlAutocomplete: String? = null,
        val idEntry: String? = null,
        val hint: String? = null,
    )

    data class Fields<T>(val username: T?, val password: T)

    // android.text.InputType constants (kept here so this file has no Android dependency).
    private const val CLASS_MASK = 0x0000000f
    private const val VARIATION_MASK = 0x00000ff0
    private const val CLASS_TEXT = 0x00000001
    private const val CLASS_NUMBER = 0x00000002
    private const val CLASS_PHONE = 0x00000003
    private val TEXT_PASSWORDS = setOf(0x00000080, 0x00000090, 0x000000e0) // password, visible password, web password
    private const val NUMBER_PASSWORD = 0x00000010
    private val TEXT_EMAILS = setOf(0x00000020, 0x000000d0) // email, web email

    private val PASSWORD_HINTS = setOf("password", "currentpassword", "current-password", "newpassword", "new-password")
    private val USERNAME_HINTS = setOf("username", "emailaddress", "email", "phone", "phonenumber", "tel")
    private val PASSWORD_WORDS = listOf("password", "passwd", "pwd", "passcode", "mpin", "loginpin")
    private val PASSWORD_TOKENS = setOf("pin", "pass")
    private val USER_WORDS = listOf("user", "email", "login", "mobile", "phone", "customer", "userid", "loginid", "cif", "account")

    private fun text(n: Node<*>) = listOfNotNull(n.idEntry, n.hint).joinToString(" ").lowercase()
    private fun tokens(s: String) = s.split(Regex("[^a-z0-9]+")).filter { it.isNotEmpty() }

    fun isPassword(n: Node<*>): Boolean {
        if (n.hints.any { it.lowercase() in PASSWORD_HINTS }) return true
        if (n.htmlType.equals("password", ignoreCase = true)) return true
        if (n.htmlAutocomplete?.lowercase()?.contains("password") == true) return true
        val cls = n.inputType and CLASS_MASK
        val variation = n.inputType and VARIATION_MASK
        if (cls == CLASS_TEXT && variation in TEXT_PASSWORDS) return true
        if (cls == CLASS_NUMBER && variation == NUMBER_PASSWORD) return true
        val t = text(n)
        if (t.isEmpty()) return false
        return PASSWORD_WORDS.any { it in t } || tokens(t).any { it in PASSWORD_TOKENS }
    }

    fun isUsername(n: Node<*>): Boolean {
        if (isPassword(n)) return false
        if (n.hints.any { it.lowercase() in USERNAME_HINTS }) return true
        if (n.htmlType?.lowercase() in setOf("email", "tel")) return true
        if (n.htmlAutocomplete?.lowercase()?.let { a -> listOf("username", "email", "tel").any { it in a } } == true) return true
        val cls = n.inputType and CLASS_MASK
        if (cls == CLASS_TEXT && (n.inputType and VARIATION_MASK) in TEXT_EMAILS) return true
        if (cls == CLASS_PHONE) return true
        val t = text(n)
        return t.isNotEmpty() && USER_WORDS.any { it in t }
    }

    /**
     * The first password box, and the username box just before it: the last box that looks like a
     * username, else the last plain text box before the password.
     */
    fun <T> pick(nodes: List<Node<T>>): Fields<T>? {
        val pIndex = nodes.indexOfFirst(::isPassword)
        if (pIndex < 0) return null
        val before = nodes.subList(0, pIndex)
        val user = before.lastOrNull(::isUsername) ?: before.lastOrNull { !isPassword(it) }
        return Fields(user?.id, nodes[pIndex].id)
    }
}
